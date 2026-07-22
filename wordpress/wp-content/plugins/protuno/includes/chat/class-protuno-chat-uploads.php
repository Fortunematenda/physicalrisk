<?php
/**
 * Proton chat — image uploads under wp-content/uploads/protuno/chat/.
 *
 * @package Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Chat_Uploads' ) ) {

	/**
	 * Save and resolve chat attachment files.
	 */
	class Protuno_Chat_Uploads {

		const SUBDIR = 'protuno/chat';

		/**
		 * Allowed image MIME types.
		 *
		 * @return array<string,string> mime => extension
		 */
		public static function allowed_mimes() {
			return array(
				'image/jpeg' => 'jpg',
				'image/png'  => 'png',
				'image/gif'  => 'gif',
				'image/webp' => 'webp',
			);
		}

		/**
		 * Ensure upload directories exist (activation + first save).
		 */
		public static function ensure_directories() {
			$base = self::get_base_dir();
			if ( ! $base ) {
				return;
			}

			wp_mkdir_p( $base );

			$index = trailingslashit( $base ) . 'index.php';
			if ( ! file_exists( $index ) ) {
				file_put_contents( $index, "<?php\n// Silence is golden.\n" );
			}

			$htaccess = trailingslashit( $base ) . '.htaccess';
			if ( ! file_exists( $htaccess ) ) {
				file_put_contents( $htaccess, "Options -Indexes\n" );
			}
		}

		/**
		 * Absolute path to protuno/chat/ under uploads.
		 *
		 * @return string
		 */
		public static function get_base_dir() {
			$upload = wp_upload_dir();
			if ( ! empty( $upload['error'] ) ) {
				return '';
			}
			return trailingslashit( $upload['basedir'] ) . self::SUBDIR;
		}

		/**
		 * Public URL base for chat images (no trailing slash on return — caller adds /relPath).
		 *
		 * @return string
		 */
		public static function get_base_url() {
			$upload = wp_upload_dir();
			if ( ! empty( $upload['error'] ) ) {
				return '';
			}
			return trailingslashit( $upload['baseurl'] ) . self::SUBDIR;
		}

		/**
		 * Widget-specific directory (created on demand).
		 *
		 * @param string $widget_id Widget id.
		 * @return string Absolute path or empty.
		 */
		public static function get_widget_dir( $widget_id ) {
			$widget_id = sanitize_file_name( (string) $widget_id );
			if ( '' === $widget_id ) {
				return '';
			}

			$dir = trailingslashit( self::get_base_dir() ) . $widget_id;
			wp_mkdir_p( $dir );

			$index = trailingslashit( $dir ) . 'index.php';
			if ( ! file_exists( $index ) ) {
				file_put_contents( $index, "<?php\n// Silence is golden.\n" );
			}

			return $dir;
		}

		/**
		 * Save one base64 image for a widget.
		 *
		 * @param string $widget_id Widget id.
		 * @param array  $image     { data, mediaType, name }.
		 * @return array|\WP_Error Attachment meta or error.
		 */
		public static function save_image( $widget_id, array $image ) {
			$widget_id = sanitize_file_name( (string) $widget_id );
			if ( '' === $widget_id ) {
				return new WP_Error( 'invalid_widget', __( 'Invalid widget id.', 'protuno' ) );
			}

			$data = isset( $image['data'] ) ? (string) $image['data'] : '';
			if ( '' === $data ) {
				return new WP_Error( 'empty_image', __( 'Empty image data.', 'protuno' ) );
			}

			$media_type = isset( $image['mediaType'] ) ? sanitize_text_field( (string) $image['mediaType'] ) : '';
			$allowed    = self::allowed_mimes();
			if ( ! isset( $allowed[ $media_type ] ) ) {
				return new WP_Error( 'invalid_mime', __( 'Unsupported image type.', 'protuno' ) );
			}

			$binary = base64_decode( $data, true );
			if ( false === $binary || '' === $binary ) {
				return new WP_Error( 'invalid_base64', __( 'Invalid image data.', 'protuno' ) );
			}

			$max_bytes = (int) apply_filters( 'uichemy_chat_max_upload_bytes', 10 * 1024 * 1024 );
			if ( strlen( $binary ) > $max_bytes ) {
				return new WP_Error( 'file_too_large', __( 'Image exceeds maximum upload size.', 'protuno' ) );
			}

			self::ensure_directories();
			$dir = self::get_widget_dir( $widget_id );
			if ( '' === $dir ) {
				return new WP_Error( 'upload_dir', __( 'Upload directory is not available.', 'protuno' ) );
			}

			$ext      = $allowed[ $media_type ];
			$filename = 'uich-img-' . gmdate( 'Ymd-His' ) . '-' . wp_generate_password( 8, false, false ) . '.' . $ext;
			$path     = trailingslashit( $dir ) . $filename;

			if ( false === file_put_contents( $path, $binary ) ) {
				return new WP_Error( 'write_failed', __( 'Could not save image.', 'protuno' ) );
			}

			$rel_path = $widget_id . '/' . $filename;

			return array(
				'relPath'      => $rel_path,
				'mediaType'    => $media_type,
				'originalName' => isset( $image['name'] ) ? sanitize_file_name( (string) $image['name'] ) : $filename,
			);
		}

		/**
		 * Save multiple images.
		 *
		 * @param string $widget_id Widget id.
		 * @param array  $images    List of image payloads.
		 * @return array{attachments:array,errors:array}
		 */
		public static function save_images( $widget_id, array $images ) {
			$attachments = array();
			$errors      = array();

			foreach ( $images as $index => $image ) {
				if ( ! is_array( $image ) ) {
					continue;
				}
				$result = self::save_image( $widget_id, $image );
				if ( is_wp_error( $result ) ) {
					$errors[] = array(
						'index'   => $index,
						'message' => $result->get_error_message(),
					);
					continue;
				}
				$attachments[] = $result;
			}

			return array(
				'attachments' => $attachments,
				'errors'      => $errors,
			);
		}

		/**
		 * Resolve a public URL for a relative path.
		 *
		 * @param string $rel_path Path relative to protuno/chat/.
		 * @return string
		 */
		public static function get_url( $rel_path ) {
			$rel_path = self::sanitize_rel_path( $rel_path );
			if ( '' === $rel_path ) {
				return '';
			}
			return trailingslashit( self::get_base_url() ) . $rel_path;
		}

		/**
		 * Validate rel path and return absolute filesystem path.
		 *
		 * @param string $rel_path Relative path.
		 * @return string Absolute path or empty if invalid.
		 */
		public static function resolve_path( $rel_path ) {
			$rel_path = self::sanitize_rel_path( $rel_path );
			if ( '' === $rel_path ) {
				return '';
			}

			$base = wp_normalize_path( self::get_base_dir() );
			$full = wp_normalize_path( trailingslashit( $base ) . $rel_path );

			if ( 0 !== strpos( $full, $base ) ) {
				return '';
			}

			if ( ! is_file( $full ) ) {
				return '';
			}

			return $full;
		}

		/**
		 * Sanitize relative path (no .., no absolute).
		 *
		 * @param string $rel_path Raw path.
		 * @return string
		 */
		public static function sanitize_rel_path( $rel_path ) {
			$rel_path = str_replace( '\\', '/', (string) $rel_path );
			$rel_path = ltrim( $rel_path, '/' );

			if ( '' === $rel_path || false !== strpos( $rel_path, '..' ) ) {
				return '';
			}

			$parts  = array();
			$chunks = explode( '/', $rel_path );
			foreach ( $chunks as $chunk ) {
				$chunk = sanitize_file_name( $chunk );
				if ( '' !== $chunk ) {
					$parts[] = $chunk;
				}
			}

			return implode( '/', $parts );
		}
	}
}
