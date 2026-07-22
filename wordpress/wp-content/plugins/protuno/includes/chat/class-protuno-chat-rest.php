<?php
/**
 * Proton chat — REST API (history, messages, uploads).
 *
 * @package Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once PROTUNO_PATH . 'includes/chat/class-protuno-chat-db.php';
require_once PROTUNO_PATH . 'includes/chat/class-protuno-chat-uploads.php';

if ( ! class_exists( 'Protuno_Chat_REST' ) ) {

	/**
	 * REST routes for WordPress-provider chat persistence.
	 */
	class Protuno_Chat_REST {

		const REST_NAMESPACE = 'protuno/v1';

		/**
		 * Register hooks.
		 */
		public static function init() {
			add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
			add_action( 'init', array( 'Protuno_Chat_DB', 'maybe_install' ) );
		}

		/**
		 * Register routes.
		 */
		public static function register_routes() {
			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/conversations',
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_conversations' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
						'args'                => array(
							'widgetId' => array(
								'required'          => true,
								'type'              => 'string',
								'sanitize_callback' => 'sanitize_text_field',
							),
						),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/conversation',
				array(
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_conversation' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/conversation/(?P<id>\d+)',
				array(
					array(
						'methods'             => 'DELETE',
						'callback'            => array( __CLASS__, 'handle_delete_conversation' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
						'args'                => array(
							'id' => array(
								'required' => true,
								'type'     => 'integer',
							),
						),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/history',
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_history' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
						'args'                => array(
							'conversationId' => array(
								'required' => true,
								'type'     => 'integer',
							),
						),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/message',
				array(
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_message' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/upload',
				array(
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_upload' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/import',
				array(
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_import' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/model',
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_model' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_model' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/globals-snapshot',
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_globals_snapshot' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/globals-sync',
				array(
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_globals_sync' ),
						'permission_callback' => array( __CLASS__, 'check_globals_write_permission' ),
					),
				)
			);

			// Atomic globals (Elementor v4). Mirrors the WP-native MCP server's
			// check_config / get_atomic_globals / sync_atomic_globals so the
			// sidecar (Claude/Codex/Gemini/OpenCode) path can sync globals on
			// atomic-enabled sites, where classic globals-sync is a no-op.
			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/check-config',
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_check_config' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/atomic-globals',
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_atomic_globals' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/atomic-globals-sync',
				array(
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_atomic_globals_sync' ),
						'permission_callback' => array( __CLASS__, 'check_globals_write_permission' ),
					),
				)
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/chat/site-code',
				array(
					array(
						'methods'             => 'GET',
						'callback'            => array( __CLASS__, 'handle_get_site_code' ),
						'permission_callback' => array( __CLASS__, 'check_permission' ),
					),
					array(
						'methods'             => 'POST',
						'callback'            => array( __CLASS__, 'handle_post_site_code' ),
						'permission_callback' => array( __CLASS__, 'check_globals_write_permission' ),
					),
				)
			);
		}

		/**
		 * Same auth as Protuno_Agent_Endpoint. Delegates to the central
		 * Protuno_Rest_Permissions class so all Protuno REST routes share
		 * one capability + legacy-token policy.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return bool|\WP_Error
		 */
		public static function check_permission( WP_REST_Request $request ) {
			return Protuno_Rest_Permissions::check_admin( $request );
		}

		/**
		 * GET /chat/conversations?widgetId=
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_get_conversations( WP_REST_Request $request ) {
			$widget_id     = $request->get_param( 'widgetId' );
			$conversations = Protuno_Chat_DB::get_conversations_for_widget( $widget_id );
			$prefs    = Protuno_Chat_DB::get_prefs();
			$provider = isset( $prefs['last_provider'] ) ? (string) $prefs['last_provider'] : 'wp';

			return new WP_REST_Response(
				array(
					'conversations' => $conversations,
					'provider'      => $provider,
					'model'         => Protuno_Chat_DB::get_last_model_for_provider( $provider ),
				),
				200
			);
		}

		/**
		 * POST /chat/conversation — create a new empty conversation.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_post_conversation( WP_REST_Request $request ) {
			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$widget_id  = isset( $body['widgetId'] ) ? sanitize_text_field( (string) $body['widgetId'] ) : '';
			$post_id    = isset( $body['postId'] ) ? absint( $body['postId'] ) : 0;
			$page_title = isset( $body['pageTitle'] ) ? (string) $body['pageTitle'] : '';

			if ( '' === $widget_id ) {
				return self::error( 400, 'bad_request', 'widgetId is required.' );
			}

			$conversation_id = Protuno_Chat_DB::create_conversation( $widget_id, $post_id, $page_title );
			if ( ! $conversation_id ) {
				return self::error( 500, 'db_error', 'Could not create conversation.' );
			}

			return new WP_REST_Response(
				array(
					'success'                => true,
					'conversationId'         => $conversation_id,
					'uploadsBaseUrl'         => trailingslashit( Protuno_Chat_Uploads::get_base_url() ),
					'templateType'           => self::get_template_type( $post_id ),
					'templateTargetPostType' => self::get_template_target_post_type( $post_id ),
				),
				200
			);
		}

		/**
		 * Detect if a post is a site header, footer, or single-post template.
		 * Supports Elementor Pro (elementor_library) and Nexter (nxt_builder).
		 *
		 * @param int $post_id Post ID.
		 * @return string|null 'header', 'footer', 'single', or null.
		 */
		private static function get_template_type( $post_id ) {
			if ( ! $post_id ) {
				return null;
			}

			$post_type = get_post_type( $post_id );

			if ( 'elementor_library' === $post_type ) {
				$type = get_post_meta( $post_id, '_elementor_template_type', true );
				if ( in_array( $type, array( 'header', 'footer', 'single' ), true ) ) {
					return $type;
				}
			}

			if ( 'nxt_builder' === $post_type ) {
				$type = get_post_meta( $post_id, 'nxt-hooks-layout-sections', true );
				if ( 'header' === $type || 'footer' === $type ) {
					return $type;
				}
				if ( 'singular' === $type ) {
					return 'single';
				}
			}

			return null;
		}

		/**
		 * For single-post templates, return the WordPress post type the template
		 * is scoped to (e.g. 'post', 'product'). Returns null for all other types.
		 *
		 * @param int $post_id Post ID.
		 * @return string|null Post type slug or null.
		 */
		private static function get_template_target_post_type( $post_id ) {
			if ( ! $post_id ) {
				return null;
			}

			$post_type = get_post_type( $post_id );

			if ( 'elementor_library' === $post_type ) {
				$template_type = get_post_meta( $post_id, '_elementor_template_type', true );
				if ( 'single' !== $template_type ) {
					return null;
				}
				// _elementor_conditions is a JSON array, e.g. ["include/singular/post"].
				$raw = get_post_meta( $post_id, '_elementor_conditions', true );
				if ( $raw ) {
					$conditions = is_string( $raw ) ? json_decode( $raw, true ) : $raw;
					if ( is_array( $conditions ) ) {
						foreach ( $conditions as $condition ) {
							if ( is_string( $condition ) && preg_match( '#^include/singular/(.+)$#', $condition, $m ) ) {
								return $m[1];
							}
						}
					}
				}
				return 'post';
			}

			if ( 'nxt_builder' === $post_type ) {
				$section = get_post_meta( $post_id, 'nxt-hooks-layout-sections', true );
				if ( 'singular' !== $section ) {
					return null;
				}
				$group = get_post_meta( $post_id, 'nxt-singular-group', true );
				if ( is_array( $group ) ) {
					foreach ( $group as $rule ) {
						if ( is_array( $rule )
							&& isset( $rule['nxt-singular-include-exclude'] )
							&& 'include' === $rule['nxt-singular-include-exclude']
							&& ! empty( $rule['nxt-singular-conditional-rule'] )
						) {
							return sanitize_key( $rule['nxt-singular-conditional-rule'] );
						}
					}
				}
				return 'post';
			}

			return null;
		}

		/**
		 * DELETE /chat/conversation/{id} — permanently delete a conversation
		 * and all its messages from the database.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_delete_conversation( WP_REST_Request $request ) {
			$conversation_id = (int) $request->get_param( 'id' );
			if ( $conversation_id <= 0 ) {
				return self::error( 400, 'bad_request', 'A valid conversation id is required.' );
			}

			$deleted = Protuno_Chat_DB::delete_conversation( $conversation_id );
			if ( ! $deleted ) {
				return self::error( 404, 'not_found', 'Conversation not found or already deleted.' );
			}

			return new WP_REST_Response(
				array(
					'success'        => true,
					'conversationId' => $conversation_id,
				),
				200
			);
		}

		/**
		 * GET /chat/history?conversationId=
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_get_history( WP_REST_Request $request ) {
			global $wpdb;

			$conversation_id = (int) $request->get_param( 'conversationId' );
			$data            = Protuno_Chat_DB::get_history( $conversation_id );

			$data['uploadsBaseUrl'] = trailingslashit( Protuno_Chat_Uploads::get_base_url() );

			if ( $conversation_id > 0 ) {
				$tables  = Protuno_Chat_DB::tables();
				$post_id = (int) $wpdb->get_var(
					$wpdb->prepare(
						"SELECT post_id FROM {$tables['conversations']} WHERE id = %d LIMIT 1",
						$conversation_id
					)
				);
				$data['templateType']           = self::get_template_type( $post_id );
				$data['templateTargetPostType'] = self::get_template_target_post_type( $post_id );
			}

			return new WP_REST_Response( $data, 200 );
		}

		/**
		 * POST /chat/message — append one message to an existing conversation.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_post_message( WP_REST_Request $request ) {
			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$conversation_id = isset( $body['conversationId'] ) ? absint( $body['conversationId'] ) : 0;
			if ( ! $conversation_id ) {
				return self::error( 400, 'bad_request', 'conversationId is required.' );
			}

			$message = array(
				'role'             => isset( $body['role'] ) ? $body['role'] : '',
				'content'          => isset( $body['content'] ) ? $body['content'] : '',
				'provider'         => isset( $body['provider'] ) ? $body['provider'] : 'wp',
				'model'            => isset( $body['model'] ) ? $body['model'] : '',
				'selectedSelector' => isset( $body['selectedSelector'] ) ? $body['selectedSelector'] : '',
				'attachments'      => isset( $body['attachments'] ) ? $body['attachments'] : array(),
				'toolCalls'        => isset( $body['toolCalls'] ) ? $body['toolCalls'] : array(),
			);

			$message_id = Protuno_Chat_DB::insert_message( $conversation_id, $message );
			if ( ! $message_id ) {
				return self::error( 400, 'invalid_message', 'Could not save message.' );
			}

			Protuno_Chat_DB::save_model_preference( $message['provider'], $message['model'] );

			return new WP_REST_Response(
				array(
					'success'   => true,
					'messageId' => $message_id,
				),
				200
			);
		}

		/**
		 * POST /chat/upload — save base64 images to disk.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_post_upload( WP_REST_Request $request ) {
			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$widget_id = isset( $body['widgetId'] ) ? sanitize_text_field( (string) $body['widgetId'] ) : '';
			if ( '' === $widget_id ) {
				return self::error( 400, 'bad_request', 'widgetId is required.' );
			}

			$images = isset( $body['images'] ) && is_array( $body['images'] ) ? $body['images'] : array();
			if ( empty( $images ) ) {
				return new WP_REST_Response(
					array(
						'success'     => true,
						'attachments' => array(),
					),
					200
				);
			}

			$result = Protuno_Chat_Uploads::save_images( $widget_id, $images );

			return new WP_REST_Response(
				array(
					'success'       => true,
					'attachments'   => $result['attachments'],
					'errors'        => $result['errors'],
					'uploadsBaseUrl' => trailingslashit( Protuno_Chat_Uploads::get_base_url() ),
				),
				200
			);
		}

		/**
		 * POST /chat/import — one-time localStorage migration.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_post_import( WP_REST_Request $request ) {
			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$widget_id = isset( $body['widgetId'] ) ? sanitize_text_field( (string) $body['widgetId'] ) : '';
			if ( '' === $widget_id ) {
				return self::error( 400, 'bad_request', 'widgetId is required.' );
			}

			$data  = isset( $body['data'] ) && is_array( $body['data'] ) ? $body['data'] : array();
			$count = Protuno_Chat_DB::import_history( $widget_id, $data );

			return new WP_REST_Response(
				array(
					'success' => true,
					'imported' => $count,
				),
				200
			);
		}

		/**
		 * GET /chat/model — last saved provider + model preference.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_get_model( WP_REST_Request $request ) {
			unset( $request );
			$provider = Protuno_Chat_DB::get_last_provider();

			return new WP_REST_Response(
				array(
					'provider' => $provider,
					'model'    => Protuno_Chat_DB::get_last_model_for_provider( $provider ),
				),
				200
			);
		}

		/**
		 * POST /chat/model — save model preference for widget thread.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return WP_REST_Response
		 */
		public static function handle_post_model( WP_REST_Request $request ) {
			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$provider = isset( $body['provider'] ) ? sanitize_text_field( (string) $body['provider'] ) : 'wp';
			$model    = isset( $body['model'] ) ? sanitize_text_field( (string) $body['model'] ) : '';

			Protuno_Chat_DB::save_model_preference( $provider, $model );

			return new WP_REST_Response( array( 'success' => true ), 200 );
		}

		/**
		 * Stricter permission for global kit writes. Mirrors Elementor's own
		 * gate for kit edits so subscribers / authors can't mutate the kit
		 * through the chat sync tool.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return bool|\WP_Error
		 */
		public static function check_globals_write_permission( WP_REST_Request $request ) {
			return Protuno_Rest_Permissions::check_admin( $request );
		}

		/**
		 * GET /chat/globals-snapshot
		 *
		 * Returns the AI Data Sharing CSS snapshot built by
		 * Protuno_Globals::get_ai_data_snapshot() along with counts and a sha1
		 * hash so the client can skip re-sending unchanged blobs.
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_get_globals_snapshot( WP_REST_Request $request ) {
			if ( ! class_exists( 'Protuno_Globals' ) || ! method_exists( 'Protuno_Globals', 'get_ai_data_snapshot' ) ) {
				return new WP_REST_Response(
					array(
						'success'  => true,
						'present'  => false,
						'snapshot' => '',
						'counts'   => array( 'colors' => 0, 'typography' => 0 ),
						'hash'     => '',
						'reason'   => 'uich_globals_unavailable',
					),
					200
				);
			}

			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new WP_REST_Response(
					array(
						'success'  => true,
						'present'  => false,
						'snapshot' => '',
						'counts'   => array( 'colors' => 0, 'typography' => 0 ),
						'hash'     => '',
						'reason'   => 'elementor_inactive',
					),
					200
				);
			}

			$snapshot  = (string) Protuno_Globals::get_ai_data_snapshot();
			$globals   = Protuno_Globals::get_globals();
			$colors    = isset( $globals['colors'] ) && is_array( $globals['colors'] ) ? count( $globals['colors'] ) : 0;
			$typo      = isset( $globals['typography'] ) && is_array( $globals['typography'] ) ? count( $globals['typography'] ) : 0;
			$cont_w    = isset( $globals['container_width'] ) && is_array( $globals['container_width'] )
				? $globals['container_width']
				: null;
			$desktop_w = ( $cont_w && isset( $cont_w['desktop'] ) && is_array( $cont_w['desktop'] ) )
				? $cont_w['desktop']
				: null;

			// "Present" = kit has at least one color OR typography entry. An
			// empty snapshot is still returned so the AI can be told the kit
			// is bare and offered to seed it via sync_globals.
			$present = ( $colors > 0 || $typo > 0 );

			return new WP_REST_Response(
				array(
					'success'  => true,
					'present'  => $present,
					'snapshot' => $snapshot,
					'counts'   => array(
						'colors'          => $colors,
						'typography'      => $typo,
						'container_width' => $desktop_w,
					),
					'hash'     => '' !== $snapshot ? sha1( $snapshot ) : '',
				),
				200
			);
		}

		/**
		 * POST /chat/globals-sync
		 *
		 * Thin wrapper over Protuno_Globals::sync_globals(). Accepts the same
		 * payload shape as the MCP sync_globals tool — { colors[], typography[],
		 * container_width? }. Returns the fresh snapshot so the client can
		 * inject the post-sync state into the next turn.
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_post_globals_sync( WP_REST_Request $request ) {
			if ( ! class_exists( 'Protuno_Globals' ) ) {
				return self::error( 500, 'uich_globals_unavailable', 'Protuno_Globals class not found.' );
			}
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return self::error( 500, 'elementor_inactive', 'Elementor is not active.' );
			}

			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$colors          = isset( $body['colors'] ) && is_array( $body['colors'] ) ? $body['colors'] : array();
			$typography      = isset( $body['typography'] ) && is_array( $body['typography'] ) ? $body['typography'] : array();
			$container_width = isset( $body['container_width'] ) ? $body['container_width'] : null;

			if ( empty( $colors ) && empty( $typography ) && null === $container_width ) {
				return self::error( 400, 'bad_request', 'No sync operations provided.' );
			}

			// Convert to object form for sync_globals() (matches MCP path).
			$sync_data = json_decode( wp_json_encode( $body ) );
			Protuno_Globals::sync_globals( $sync_data );

			if ( null !== $container_width && method_exists( 'Protuno_Globals', 'set_container_breakpoints_width' ) ) {
				$cw_data = json_decode( wp_json_encode( $container_width ) );
				Protuno_Globals::set_container_breakpoints_width( $cw_data );
			}

			$snapshot = (string) Protuno_Globals::get_ai_data_snapshot();
			$globals  = Protuno_Globals::get_globals();
			$count_c  = isset( $globals['colors'] ) && is_array( $globals['colors'] ) ? count( $globals['colors'] ) : 0;
			$count_t  = isset( $globals['typography'] ) && is_array( $globals['typography'] ) ? count( $globals['typography'] ) : 0;

			// Tally what was applied for the response so the AI can confirm.
			$tally = array(
				'colors'     => array( 'ADD' => 0, 'SET' => 0, 'DEL' => 0 ),
				'typography' => array( 'ADD' => 0, 'SET' => 0, 'DEL' => 0 ),
			);
			foreach ( $colors as $c ) {
				$action = isset( $c['action'] ) ? strtoupper( (string) $c['action'] ) : '';
				if ( isset( $tally['colors'][ $action ] ) ) {
					$tally['colors'][ $action ]++;
				}
			}
			foreach ( $typography as $t ) {
				$action = isset( $t['action'] ) ? strtoupper( (string) $t['action'] ) : '';
				if ( isset( $tally['typography'][ $action ] ) ) {
					$tally['typography'][ $action ]++;
				}
			}

			return new WP_REST_Response(
				array(
					'success'  => true,
					'applied'  => $tally,
					'globals'  => $globals,
					'snapshot' => $snapshot,
					'present'  => ( $count_c > 0 || $count_t > 0 ),
					'counts'   => array(
						'colors'     => $count_c,
						'typography' => $count_t,
					),
					'hash'     => '' !== $snapshot ? sha1( $snapshot ) : '',
				),
				200
			);
		}

		/**
		 * GET /chat/check-config
		 *
		 * Thin wrapper over Protuno_Proton_MCP_Server::execute_check_config().
		 * The sidecar bridge calls this first so the agent knows whether to use
		 * the classic globals tools or the atomic ones (atomic_enabled flag).
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_get_check_config( WP_REST_Request $request ) {
			if ( ! class_exists( 'Protuno_Proton_MCP_Server' )
				|| ! method_exists( 'Protuno_Proton_MCP_Server', 'execute_check_config' ) ) {
				return self::error( 500, 'config_unavailable', 'Config service is unavailable.' );
			}

			$config = Protuno_Proton_MCP_Server::execute_check_config();
			if ( is_wp_error( $config ) ) {
				return self::error( 500, $config->get_error_code(), $config->get_error_message() );
			}

			return new WP_REST_Response(
				array(
					'success' => true,
					'config'  => $config,
				),
				200
			);
		}

		/**
		 * GET /chat/atomic-globals
		 *
		 * Thin wrapper over Protuno_Proton_MCP_Server::execute_get_atomic_globals().
		 * Returns the Elementor v4 atomic global snapshot (color variables, global
		 * typography classes, width/padding/border/gap/shadow classes). The
		 * execute_* method already guards on is_atomic_enabled().
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_get_atomic_globals( WP_REST_Request $request ) {
			if ( ! class_exists( 'Protuno_Proton_MCP_Server' )
				|| ! method_exists( 'Protuno_Proton_MCP_Server', 'execute_get_atomic_globals' ) ) {
				return self::error( 500, 'atomic_unavailable', 'Atomic globals support is unavailable.' );
			}

			$globals = Protuno_Proton_MCP_Server::execute_get_atomic_globals();
			if ( is_wp_error( $globals ) ) {
				return self::error( 400, $globals->get_error_code(), $globals->get_error_message() );
			}

			return new WP_REST_Response(
				array(
					'success' => true,
					'globals' => $globals,
				),
				200
			);
		}

		/**
		 * POST /chat/atomic-globals-sync
		 *
		 * Thin wrapper over Protuno_Proton_MCP_Server::execute_sync_atomic_globals().
		 * Accepts the same payload shape as the MCP sync_atomic_globals tool —
		 * { data: { color[], typography[], ... }, container_width? }. The execute_*
		 * method guards on is_atomic_enabled() and handles the op reshaping.
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_post_atomic_globals_sync( WP_REST_Request $request ) {
			if ( ! class_exists( 'Protuno_Proton_MCP_Server' )
				|| ! method_exists( 'Protuno_Proton_MCP_Server', 'execute_sync_atomic_globals' ) ) {
				return self::error( 500, 'atomic_unavailable', 'Atomic globals support is unavailable.' );
			}

			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$result = Protuno_Proton_MCP_Server::execute_sync_atomic_globals( $body );
			if ( is_wp_error( $result ) ) {
				return self::error( 400, $result->get_error_code(), $result->get_error_message() );
			}

			return new WP_REST_Response(
				array(
					'success' => true,
					'result'  => $result,
				),
				200
			);
		}

		/**
		 * GET /chat/site-code
		 *
		 * Returns the site-level custom code { head, footer } stored in the
		 * protuno_proton_site_custom_code option.
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_get_site_code( WP_REST_Request $request ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' )
				|| ! method_exists( 'Protuno_Proton_Manager', 'get_site_custom_code_option' ) ) {
				return self::error( 500, 'site_code_unavailable', 'Proton Manager is unavailable.' );
			}

			$code = Protuno_Proton_Manager::get_site_custom_code_option();

			return new WP_REST_Response(
				array(
					'success' => true,
					'head'    => isset( $code['head'] )   ? (string) $code['head']   : '',
					'footer'  => isset( $code['footer'] ) ? (string) $code['footer'] : '',
				),
				200
			);
		}

		/**
		 * POST /chat/site-code
		 *
		 * Saves { head, footer } to the site-level custom code option.
		 * Uses the trusted path so raw HTML/JS is stored without wp_kses stripping.
		 *
		 * @return WP_REST_Response
		 */
		public static function handle_post_site_code( WP_REST_Request $request ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' )
				|| ! method_exists( 'Protuno_Proton_Manager', 'update_site_custom_code_option' ) ) {
				return self::error( 500, 'site_code_unavailable', 'Proton Manager is unavailable.' );
			}

			$body = $request->get_json_params();
			if ( empty( $body ) || ! is_array( $body ) ) {
				return self::error( 400, 'bad_request', 'Invalid JSON body.' );
			}

			$head   = isset( $body['head'] )   ? (string) $body['head']   : '';
			$footer = isset( $body['footer'] ) ? (string) $body['footer'] : '';

			$saved = Protuno_Proton_Manager::update_site_custom_code_option( $head, $footer, true );

			return new WP_REST_Response(
				array(
					'success' => true,
					'head'    => isset( $saved['head'] )   ? (string) $saved['head']   : '',
					'footer'  => isset( $saved['footer'] ) ? (string) $saved['footer'] : '',
				),
				200
			);
		}

		/**
		 * @param int    $status HTTP status.
		 * @param string $code   Error code.
		 * @param string $message Message.
		 * @return WP_REST_Response
		 */
		private static function error( $status, $code, $message ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'error'   => $message,
					'code'    => $code,
				),
				$status
			);
		}
	}
}
