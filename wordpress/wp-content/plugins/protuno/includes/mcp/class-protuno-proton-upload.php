<?php
/**
 * Temporary image upload endpoint for the Composer pipeline.
 *
 * Why: `media_sideload_image` (used by `add_uichemy_composer_section` /
 * `create_uichemy_composer_page` / `set_site_branding`) needs a real
 * public URL inside `<img src="…">`. Figma works because Figma serves
 * public CDN URLs. AI-generated images (gen-AI model output, local
 * files, screenshots) have no such URL, so the sideload step silently
 * fails or fabricates a broken `src`.
 *
 * This class issues short-lived, single-use upload slots. The MCP tool
 * `request_image_upload` calls `issue_slot()` and returns the slot URL
 * + token + ready-to-run curl example to the AI. The AI then PUTs raw
 * bytes (or POSTs multipart) to `/wp-json/protuno/v1/composer-upload`,
 * the handler validates the slot, sideloads the file into the WP media
 * library, marks `_source_url = uichemy:slot:<id>` so the existing
 * Composer dedupe path reuses it, and returns the permanent media URL.
 *
 * @package Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Proton_Upload' ) ) {

	final class Protuno_Proton_Upload {

		const REST_NAMESPACE        = 'protuno/v1';
		const REST_ROUTE            = 'composer-upload';
		const SLOT_TRANSIENT_PREFIX = 'uich_upl_';
		const TOKEN_HEADER          = 'X-Protuno-Upload-Token';

		const DEFAULT_TTL_MINUTES = 10;
		const MIN_TTL_MINUTES     = 1;
		const MAX_TTL_MINUTES     = 10;

		const DEFAULT_MAX_BYTES = 10485760;  // 10 MB
		const ABSOLUTE_MAX_BYTES = 26214400; // 25 MB hard cap

		/**
		 * Allowed MIME → extension map. Anything outside this is rejected
		 * both at slot issue and at upload time.
		 */
		private static function allowed_mimes() {
			return array(
				'image/png'     => 'png',
				'image/jpeg'    => 'jpg',
				'image/webp'    => 'webp',
				'image/gif'     => 'gif',
				'image/svg+xml' => 'svg',
			);
		}

		// ============================================================
		// BOOTSTRAP
		// ============================================================

		public static function init() {
			add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		}

		public static function register_routes() {
			$args = array(
				'slot' => array(
					'type'              => 'string',
					'required'          => true,
					'sanitize_callback' => 'sanitize_key',
				),
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/' . self::REST_ROUTE,
				array(
					array(
						'methods'             => 'PUT',
						'callback'            => array( __CLASS__, 'handle_upload' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
						'args'                => $args,
					),
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_upload' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
						'args'                => $args,
					),
				)
			);
		}

		public static function check_permission( WP_REST_Request $request ) {
			// Token-authenticated curl PUTs carry no WP login cookie, so check
			// the slot token before the admin session and restore the issuing
			// user (request-scoped only) for the downstream user_id guard.
			$slot  = sanitize_key( (string) $request->get_param( 'slot' ) );
			$token = self::pick_token( $request );
			if ( '' !== $slot && '' !== $token ) {
				$payload = get_transient( self::SLOT_TRANSIENT_PREFIX . $slot );
				if ( is_array( $payload )
					&& isset( $payload['token_hash'], $payload['user_id'] )
					&& hash_equals( (string) $payload['token_hash'], wp_hash( $token ) )
				) {
					wp_set_current_user( (int) $payload['user_id'] );
					return true;
				}
			}

			if ( ! class_exists( 'Protuno_Rest_Permissions' ) ) {
				require_once PROTUNO_PATH . 'includes/admin/class-protuno-rest-permissions.php';
			}
			return Protuno_Rest_Permissions::check_admin( $request );
		}

		// ============================================================
		// SLOT ISSUE
		// ============================================================

		/**
		 * Issue a one-time upload slot. Called from the MCP tool handler
		 * (`execute_request_image_upload`) after auth + per-tool gating.
		 *
		 * @param array{filename?:string, mime?:string, ttl_minutes?:int, max_bytes?:int} $args
		 * @return array|WP_Error
		 */
		public static function issue_slot( $args = array() ) {
			$user_id = get_current_user_id();
			if ( ! $user_id ) {
				return new WP_Error( 'uich_upload_no_user', 'Authenticated user required to issue an upload slot.' );
			}

			$args = is_array( $args ) ? $args : array();

			$filename = isset( $args['filename'] ) ? sanitize_file_name( (string) $args['filename'] ) : '';
			if ( '' === $filename ) {
				$filename = 'uichemy-ai-' . wp_generate_password( 6, false, false ) . '.png';
			}

			$ext  = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
			$mime = isset( $args['mime'] ) ? strtolower( trim( (string) $args['mime'] ) ) : '';
			if ( ! isset( self::allowed_mimes()[ $mime ] ) ) {
				$mime = self::mime_from_ext( $ext );
			}
			if ( ! $mime ) {
				return new WP_Error(
					'uich_upload_bad_mime',
					sprintf(
						'Unsupported image type. Allowed mimes: %s.',
						implode( ', ', array_keys( self::allowed_mimes() ) )
					)
				);
			}

			$expected_ext = self::allowed_mimes()[ $mime ];
			if ( $ext !== $expected_ext && ! ( 'jpg' === $expected_ext && 'jpeg' === $ext ) ) {
				$filename = pathinfo( $filename, PATHINFO_FILENAME ) . '.' . $expected_ext;
			}

			$ttl = isset( $args['ttl_minutes'] ) ? (int) $args['ttl_minutes'] : self::DEFAULT_TTL_MINUTES;
			$ttl = max( self::MIN_TTL_MINUTES, min( self::MAX_TTL_MINUTES, $ttl ) );

			$max_bytes = isset( $args['max_bytes'] ) ? (int) $args['max_bytes'] : self::DEFAULT_MAX_BYTES;
			$max_bytes = max( 1024, min( self::ABSOLUTE_MAX_BYTES, $max_bytes ) );

			try {
				$slot  = bin2hex( random_bytes( 4 ) );  // 8-char short id, public
				$token = bin2hex( random_bytes( 24 ) ); // 48-char raw secret, never persisted
			} catch ( \Exception $e ) {
				return new WP_Error( 'uich_upload_random_fail', 'Could not generate upload token.' );
			}

			$payload = array(
				'token_hash' => wp_hash( $token ),
				'mime'       => $mime,
				'filename'   => $filename,
				'max_bytes'  => $max_bytes,
				'user_id'    => (int) $user_id,
				'created'    => time(),
			);

			$ok = set_transient( self::SLOT_TRANSIENT_PREFIX . $slot, $payload, $ttl * MINUTE_IN_SECONDS );
			if ( ! $ok ) {
				return new WP_Error( 'uich_upload_transient_fail', 'Could not store upload slot.' );
			}

			$upload_url = add_query_arg(
				array( 'slot' => $slot ),
				rest_url( self::REST_NAMESPACE . '/' . self::REST_ROUTE )
			);

			$curl_example = sprintf(
				"curl -X PUT --data-binary @%s -H %s -H %s %s",
				escapeshellarg( $filename ),
				escapeshellarg( self::TOKEN_HEADER . ': ' . $token ),
				escapeshellarg( 'Content-Type: ' . $mime ),
				escapeshellarg( $upload_url )
			);

			return array(
				'slot'         => $slot,
				'upload_token' => $token,
				'upload_url'   => $upload_url,
				'method'       => 'PUT',
				'header'       => self::TOKEN_HEADER,
				'mime'         => $mime,
				'filename'     => $filename,
				'max_bytes'    => $max_bytes,
				'expires_at'   => time() + ( $ttl * MINUTE_IN_SECONDS ),
				'expires_in'   => $ttl * MINUTE_IN_SECONDS,
				'ttl_minutes'  => $ttl,
				'curl_example' => $curl_example,
				'instructions' => 'Stream the image bytes to upload_url with `' . self::TOKEN_HEADER . ': <upload_token>` and `Content-Type: <mime>`. The response returns { url } — embed THAT URL inside your HTML <img src>. Slot is single-use and expires in ' . $ttl . ' minute(s).',
			);
		}

		// ============================================================
		// UPLOAD HANDLER
		// ============================================================

		public static function handle_upload( WP_REST_Request $request ) {
			$slot = sanitize_key( (string) $request->get_param( 'slot' ) );
			if ( '' === $slot ) {
				return self::rest_error( 'missing_slot', 'Missing slot query arg.', 400 );
			}

			$token = self::pick_token( $request );
			if ( '' === $token ) {
				return self::rest_error( 'missing_token', 'Missing upload token header (' . self::TOKEN_HEADER . ').', 401 );
			}

			$key     = self::SLOT_TRANSIENT_PREFIX . $slot;
			$payload = get_transient( $key );
			if ( ! is_array( $payload ) ) {
				return self::rest_error( 'slot_expired', 'Upload slot is unknown or has expired. Request a new one with request_image_upload.', 410 );
			}

			if ( ! hash_equals( (string) $payload['token_hash'], wp_hash( $token ) ) ) {
				return self::rest_error( 'bad_token', 'Upload token did not match this slot.', 401 );
			}

			if ( (int) $payload['user_id'] !== get_current_user_id() ) {
				return self::rest_error( 'wrong_user', 'This upload slot belongs to a different user.', 403 );
			}

			$bytes = self::read_body_bytes( $request );
			if ( '' === $bytes ) {
				return self::rest_error( 'empty_body', 'Upload body was empty. PUT the raw image bytes (or POST a multipart "file" field).', 400 );
			}
			if ( strlen( $bytes ) > (int) $payload['max_bytes'] ) {
				return self::rest_error( 'too_large', sprintf( 'Upload exceeds max_bytes (%d).', (int) $payload['max_bytes'] ), 413 );
			}

			$filename = (string) $payload['filename'];
			$mime     = (string) $payload['mime'];

			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';

			$tmp_path = wp_tempnam( $filename );
			if ( ! $tmp_path ) {
				return self::rest_error( 'tmp_fail', 'Could not allocate temp file for upload.', 500 );
			}
			$written = file_put_contents( $tmp_path, $bytes );
			if ( false === $written ) {
				@unlink( $tmp_path );
				return self::rest_error( 'write_fail', 'Could not write upload bytes to temp file.', 500 );
			}

			// Validate actual file contents against declared mime — only
			// skip for SVG, where wp_check_filetype_and_ext gives unhelpful
			// results on systems without finfo svg support.
			$check = wp_check_filetype_and_ext( $tmp_path, $filename );
			if ( 'image/svg+xml' !== $mime ) {
				$actual_type = ! empty( $check['type'] ) ? $check['type'] : '';
				if ( $actual_type !== $mime ) {
					@unlink( $tmp_path );
					return self::rest_error(
						'mime_mismatch',
						sprintf( 'Uploaded bytes do not match declared mime. Declared: %s, detected: %s.', $mime, $actual_type ?: 'unknown' ),
						400
					);
				}
			}

			$file_array = array(
				'name'     => $filename,
				'tmp_name' => $tmp_path,
			);

			$sideload = wp_handle_sideload( $file_array, array( 'test_form' => false ) );
			if ( ! empty( $sideload['error'] ) ) {
				@unlink( $tmp_path );
				return self::rest_error( 'sideload_fail', (string) $sideload['error'], 500 );
			}

			$attachment    = array(
				'post_mime_type' => $sideload['type'],
				'post_title'     => sanitize_file_name( pathinfo( $filename, PATHINFO_FILENAME ) ),
				'post_content'   => '',
				'post_status'    => 'inherit',
			);
			$attach_id     = wp_insert_attachment( $attachment, $sideload['file'], 0 );
			if ( is_wp_error( $attach_id ) || ! $attach_id ) {
				return self::rest_error( 'attach_fail', 'Could not create media attachment.', 500 );
			}

			$meta = wp_generate_attachment_metadata( $attach_id, $sideload['file'] );
			wp_update_attachment_metadata( $attach_id, $meta );

			// Mark for Composer dedupe path. mcp_find_existing_attachment_by_source_url
			// looks at _source_url, so a downstream `<img src>` referencing
			// this attachment URL will be reused, not re-uploaded.
			update_post_meta( $attach_id, '_source_url', 'uichemy:slot:' . $slot );

			// Burn the slot — single-use.
			delete_transient( $key );

			$url    = wp_get_attachment_url( $attach_id );
			$width  = isset( $meta['width'] ) ? (int) $meta['width'] : null;
			$height = isset( $meta['height'] ) ? (int) $meta['height'] : null;

			return rest_ensure_response(
				array(
					'attachment_id' => (int) $attach_id,
					'url'           => $url,
					'mime'          => (string) $sideload['type'],
					'width'         => $width,
					'height'        => $height,
					'bytes'         => (int) $written,
				)
			);
		}

		// ============================================================
		// HELPERS
		// ============================================================

		private static function pick_token( WP_REST_Request $request ) {
			$candidates = array(
				$request->get_header( 'x_uichemy_upload_token' ),
				$request->get_header( self::TOKEN_HEADER ),
			);
			foreach ( $candidates as $value ) {
				if ( is_string( $value ) && '' !== trim( $value ) ) {
					return trim( $value );
				}
			}
			return '';
		}

		/**
		 * Read upload bytes from either a multipart "file" field (POST) or
		 * the raw request body (PUT). Whichever the caller used.
		 */
		private static function read_body_bytes( WP_REST_Request $request ) {
			$files = $request->get_file_params();
			if ( ! empty( $files['file']['tmp_name'] ) && is_uploaded_file( $files['file']['tmp_name'] ) ) {
				$contents = file_get_contents( $files['file']['tmp_name'] );
				return is_string( $contents ) ? $contents : '';
			}
			$body = $request->get_body();
			return is_string( $body ) ? $body : '';
		}

		private static function mime_from_ext( $ext ) {
			$ext = strtolower( (string) $ext );
			$map = array(
				'png'  => 'image/png',
				'jpg'  => 'image/jpeg',
				'jpeg' => 'image/jpeg',
				'webp' => 'image/webp',
				'gif'  => 'image/gif',
				'svg'  => 'image/svg+xml',
			);
			return isset( $map[ $ext ] ) ? $map[ $ext ] : '';
		}

		private static function rest_error( $code, $message, $status ) {
			return new WP_Error( 'uich_upload_' . $code, $message, array( 'status' => (int) $status ) );
		}
	}
}
