<?php
/**
 * Proton chat — database schema and CRUD.
 *
 * @package Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Chat_DB' ) ) {

	/**
	 * Per-widget chat: conversations + messages tables.
	 * v3: widget_id is no longer UNIQUE — one widget can have many conversations.
	 */
	class Protuno_Chat_DB {

		const DB_VERSION            = 3;
		const OPTION_DB_VERSION     = 'protuno_chat_db_version';
		const OPTION_PREFS          = 'protuno_chat_prefs';
		const OPTION_PREFS_MIGRATED = 'protuno_chat_prefs_migrated';

		/**
		 * Table names (without prefix).
		 *
		 * @return array{conversations:string,messages:string}
		 */
		public static function tables() {
			global $wpdb;
			return array(
				'conversations' => $wpdb->prefix . 'protuno_chat_conversations',
				'messages'      => $wpdb->prefix . 'protuno_chat_messages',
			);
		}

		// ── Schema ────────────────────────────────────────────────────────────

		/**
		 * Create tables from scratch (fresh install or v1 upgrade via dbDelta).
		 */
		public static function install() {
			global $wpdb;

			require_once ABSPATH . 'wp-admin/includes/upgrade.php';

			$tables  = self::tables();
			$charset = $wpdb->get_charset_collate();

			// v3 schema: widget_id is a plain KEY (not UNIQUE); title column added.
			$sql = "CREATE TABLE {$tables['conversations']} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				widget_id varchar(64) NOT NULL,
				post_id bigint(20) unsigned DEFAULT NULL,
				user_id bigint(20) unsigned NOT NULL DEFAULT 0,
				title varchar(255) NOT NULL DEFAULT '',
				page_title varchar(255) NOT NULL DEFAULT '',
				created_at datetime NOT NULL,
				updated_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY widget_id (widget_id),
				KEY user_id (user_id)
			) $charset;

			CREATE TABLE {$tables['messages']} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				conversation_id bigint(20) unsigned NOT NULL,
				role varchar(20) NOT NULL,
				content longtext NOT NULL,
				provider varchar(32) NOT NULL DEFAULT 'wp',
				model varchar(128) NOT NULL DEFAULT '',
				selected_selector text NOT NULL,
				attachments longtext NOT NULL,
				tool_calls longtext NOT NULL,
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY conversation_id (conversation_id),
				KEY created_at (created_at)
			) $charset;";

			dbDelta( $sql );

			self::migrate_legacy_settings_to_option();

			if ( ! class_exists( 'Protuno_Chat_Uploads' ) ) {
				require_once PROTUNO_PATH . 'includes/chat/class-protuno-chat-uploads.php';
			}
			Protuno_Chat_Uploads::ensure_directories();

			update_option( self::OPTION_DB_VERSION, self::DB_VERSION );
		}

		/**
		 * Ensure schema is up to date on every request (handles plugin updates).
		 */
		public static function maybe_install() {
			$installed = (int) get_option( self::OPTION_DB_VERSION, 0 );
			if ( $installed >= self::DB_VERSION ) {
				return;
			}

			if ( $installed < 2 ) {
				// Fresh install or very old version — full install with current schema.
				self::install();
			} else {
				// v2 → v3: drop UNIQUE constraint on widget_id, add title column.
				self::upgrade_v2_to_v3();
			}
		}

		/**
		 * In-place v2 → v3 migration (does not recreate tables).
		 */
		private static function upgrade_v2_to_v3() {
			global $wpdb;

			$tables = self::tables();

			// 1. Add title column if it doesn't exist yet.
			$col = $wpdb->get_results( "SHOW COLUMNS FROM {$tables['conversations']} LIKE 'title'" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			if ( empty( $col ) ) {
				$wpdb->query( "ALTER TABLE {$tables['conversations']} ADD COLUMN title varchar(255) NOT NULL DEFAULT '' AFTER page_title" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			}

			// 2. Convert UNIQUE KEY widget_id → plain KEY widget_id.
			$unique = $wpdb->get_results( "SHOW INDEX FROM {$tables['conversations']} WHERE Key_name = 'widget_id' AND Non_unique = 0" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			if ( ! empty( $unique ) ) {
				$wpdb->query( "ALTER TABLE {$tables['conversations']} DROP INDEX widget_id, ADD INDEX widget_id (widget_id)" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			}

			update_option( self::OPTION_DB_VERSION, self::DB_VERSION );
		}

		// ── Conversations CRUD ────────────────────────────────────────────────

		/**
		 * Create a brand-new conversation for a widget (always inserts a new row).
		 *
		 * @param string $widget_id  Elementor widget id.
		 * @param int    $post_id    Post being edited.
		 * @param string $page_title Page title snapshot.
		 * @return int New conversation id, or 0 on failure.
		 */
		public static function create_conversation( $widget_id, $post_id = 0, $page_title = '' ) {
			global $wpdb;

			$widget_id = sanitize_text_field( (string) $widget_id );
			if ( '' === $widget_id ) {
				return 0;
			}

			$tables = self::tables();
			$now    = current_time( 'mysql', true );

			$wpdb->insert(
				$tables['conversations'],
				array(
					'widget_id'  => $widget_id,
					'post_id'    => $post_id > 0 ? $post_id : null,
					'user_id'    => get_current_user_id(),
					'title'      => '',
					'page_title' => sanitize_text_field( (string) $page_title ),
					'created_at' => $now,
					'updated_at' => $now,
				),
				array( '%s', '%d', '%d', '%s', '%s', '%s', '%s' )
			);

			return (int) $wpdb->insert_id;
		}

		/**
		 * Return all conversations for a widget, newest first, with preview text.
		 *
		 * @param string $widget_id Widget id.
		 * @return array<int,array>
		 */
		public static function get_conversations_for_widget( $widget_id ) {
			global $wpdb;

			$widget_id = sanitize_text_field( (string) $widget_id );
			if ( '' === $widget_id ) {
				return array();
			}

			$tables = self::tables();
			$rows   = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT c.id, c.widget_id, c.title, c.created_at, c.updated_at,
					        ( SELECT LEFT( m.content, 120 )
					          FROM {$tables['messages']} m
					          WHERE m.conversation_id = c.id AND m.role = 'assistant'
					          ORDER BY m.id DESC LIMIT 1 ) AS preview
					 FROM {$tables['conversations']} c
					 WHERE c.widget_id = %s
					 ORDER BY c.updated_at DESC",
					$widget_id
				),
				ARRAY_A
			);

			$result = array();
			foreach ( (array) $rows as $row ) {
				$result[] = self::format_conversation_row( $row );
			}
			return $result;
		}

		/**
		 * Get or create ONE conversation per widget — kept for import_history only.
		 * Normal chat flow uses create_conversation() or a known conversation_id.
		 *
		 * @param string $widget_id  Widget id.
		 * @param int    $post_id    Post id.
		 * @param string $page_title Page title.
		 * @return int Conversation id.
		 */
		public static function get_or_create_conversation( $widget_id, $post_id = 0, $page_title = '' ) {
			global $wpdb;

			$widget_id = sanitize_text_field( (string) $widget_id );
			if ( '' === $widget_id ) {
				return 0;
			}

			// Reuse the most-recently-updated conversation if one exists.
			$tables   = self::tables();
			$existing = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT id FROM {$tables['conversations']} WHERE widget_id = %s ORDER BY updated_at DESC LIMIT 1",
					$widget_id
				)
			);

			if ( $existing ) {
				return (int) $existing;
			}

			return self::create_conversation( $widget_id, $post_id, $page_title );
		}

		/**
		 * Permanently delete a conversation and ALL its messages.
		 *
		 * @param int $conversation_id Conversation id.
		 * @return bool True if a row was deleted, false otherwise.
		 */
		public static function delete_conversation( $conversation_id ) {
			global $wpdb;

			$conversation_id = (int) $conversation_id;
			if ( $conversation_id <= 0 ) {
				return false;
			}

			$tables = self::tables();

			// Delete messages first (no FK cascade — we own the rows).
			$wpdb->delete(
				$tables['messages'],
				array( 'conversation_id' => $conversation_id ),
				array( '%d' )
			);

			$deleted = $wpdb->delete(
				$tables['conversations'],
				array( 'id' => $conversation_id ),
				array( '%d' )
			);

			return ( false !== $deleted ) && ( (int) $deleted > 0 );
		}

		// ── Messages CRUD ─────────────────────────────────────────────────────

		/**
		 * Insert a chat message and keep updated_at + title in sync.
		 *
		 * @param int   $conversation_id Conversation id.
		 * @param array $message         Message fields.
		 * @return int Message id or 0.
		 */
		public static function insert_message( $conversation_id, array $message ) {
			global $wpdb;

			$conversation_id = (int) $conversation_id;
			if ( $conversation_id <= 0 ) {
				return 0;
			}

			$role = isset( $message['role'] ) ? sanitize_text_field( (string) $message['role'] ) : '';
			if ( ! in_array( $role, array( 'user', 'assistant' ), true ) ) {
				return 0;
			}

			$attachments = isset( $message['attachments'] ) ? $message['attachments'] : array();
			if ( is_string( $attachments ) ) {
				$attachments_json = $attachments;
			} else {
				$attachments_json = wp_json_encode( is_array( $attachments ) ? $attachments : array() );
			}

			$tool_calls = isset( $message['toolCalls'] ) ? $message['toolCalls'] : ( isset( $message['tool_calls'] ) ? $message['tool_calls'] : array() );
			if ( is_string( $tool_calls ) ) {
				$tool_calls_json = $tool_calls;
			} else {
				$tool_calls_json = wp_json_encode( is_array( $tool_calls ) ? $tool_calls : array() );
			}

			$tables = self::tables();
			$now    = current_time( 'mysql', true );

			$wpdb->insert(
				$tables['messages'],
				array(
					'conversation_id'   => $conversation_id,
					'role'              => $role,
					'content'           => isset( $message['content'] ) ? (string) $message['content'] : '',
					'provider'          => isset( $message['provider'] ) ? sanitize_text_field( (string) $message['provider'] ) : 'wp',
					'model'             => isset( $message['model'] ) ? sanitize_text_field( (string) $message['model'] ) : '',
					'selected_selector' => isset( $message['selectedSelector'] ) ? (string) $message['selectedSelector'] : ( isset( $message['selected_selector'] ) ? (string) $message['selected_selector'] : '' ),
					'attachments'       => $attachments_json,
					'tool_calls'        => $tool_calls_json,
					'created_at'        => $now,
				),
				array( '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
			);

			$message_id = (int) $wpdb->insert_id;

			if ( $message_id ) {
				// Always bump updated_at so the sidebar sorts correctly.
				$wpdb->update(
					$tables['conversations'],
					array( 'updated_at' => $now ),
					array( 'id' => $conversation_id ),
					array( '%s' ),
					array( '%d' )
				);

				// Auto-set title from the first user message.
				if ( 'user' === $role ) {
					$current_title = $wpdb->get_var(
						$wpdb->prepare(
							"SELECT title FROM {$tables['conversations']} WHERE id = %d",
							$conversation_id
						)
					);
					if ( '' === (string) $current_title ) {
						$content = isset( $message['content'] ) ? (string) $message['content'] : '';
						$title   = mb_substr( trim( $content ), 0, 120 );
						if ( $title ) {
							$wpdb->update(
								$tables['conversations'],
								array( 'title' => $title ),
								array( 'id' => $conversation_id ),
								array( '%s' ),
								array( '%d' )
							);
						}
					}
				}
			}

			return $message_id;
		}

		/**
		 * Load messages for a specific conversation.
		 *
		 * @param int $conversation_id Conversation id.
		 * @return array{messages:array,provider:string,model:string}
		 */
		public static function get_history( $conversation_id ) {
			global $wpdb;

			$conversation_id = (int) $conversation_id;
			if ( $conversation_id <= 0 ) {
				$provider = self::get_last_provider();
				return array(
					'messages' => array(),
					'provider' => $provider,
					'model'    => self::get_last_model_for_provider( $provider ),
				);
			}

			$tables = self::tables();
			$rows   = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT role, content, provider, model, selected_selector, attachments, tool_calls, created_at
					 FROM {$tables['messages']}
					 WHERE conversation_id = %d
					 ORDER BY created_at ASC, id ASC",
					$conversation_id
				),
				ARRAY_A
			);

			$messages = array();
			foreach ( (array) $rows as $row ) {
				$messages[] = self::format_message_row( $row );
			}

			$last_assistant = null;
			for ( $i = count( $messages ) - 1; $i >= 0; $i-- ) {
				if ( 'assistant' === $messages[ $i ]['role'] ) {
					$last_assistant = $messages[ $i ];
					break;
				}
			}

			$provider = $last_assistant ? (string) $last_assistant['provider'] : self::get_last_provider();
			$model    = $last_assistant ? (string) $last_assistant['model'] : self::get_last_model_for_provider( $provider );

			return array(
				'messages' => $messages,
				'provider' => $provider,
				'model'    => $model,
			);
		}

		// ── Row formatters ────────────────────────────────────────────────────

		/**
		 * Format a messages DB row for REST / JS.
		 *
		 * @param array $row DB row.
		 * @return array
		 */
		public static function format_message_row( array $row ) {
			$attachments = json_decode( isset( $row['attachments'] ) ? $row['attachments'] : '[]', true );
			$tool_calls  = json_decode( isset( $row['tool_calls'] ) ? $row['tool_calls'] : '[]', true );

			return array(
				'role'             => (string) $row['role'],
				'content'          => (string) $row['content'],
				'provider'         => isset( $row['provider'] ) ? (string) $row['provider'] : 'wp',
				'model'            => isset( $row['model'] ) ? (string) $row['model'] : '',
				'selectedSelector' => isset( $row['selected_selector'] ) ? (string) $row['selected_selector'] : '',
				'attachments'      => is_array( $attachments ) ? $attachments : array(),
				'toolCalls'        => is_array( $tool_calls ) ? $tool_calls : array(),
				'createdAt'        => isset( $row['created_at'] ) ? (string) $row['created_at'] : '',
			);
		}

		/**
		 * Format a conversations DB row for REST / JS.
		 *
		 * @param array $row DB row.
		 * @return array
		 */
		private static function format_conversation_row( array $row ) {
			return array(
				'id'        => (int) $row['id'],
				'widgetId'  => (string) $row['widget_id'],
				'title'     => (string) $row['title'],
				'preview'   => isset( $row['preview'] ) ? (string) $row['preview'] : '',
				'updatedAt' => isset( $row['updated_at'] ) ? (string) $row['updated_at'] : '',
				'createdAt' => isset( $row['created_at'] ) ? (string) $row['created_at'] : '',
			);
		}

		// ── Preferences ───────────────────────────────────────────────────────

		/**
		 * Chat agent preferences stored in wp_options.
		 *
		 * @return array{last_provider:string,models:array<string,string>}
		 */
		public static function get_prefs() {
			$prefs = get_option( self::OPTION_PREFS, array() );
			if ( ! is_array( $prefs ) ) {
				$prefs = array();
			}

			$defaults = array(
				'last_provider' => 'wp',
				'models'        => array(),
			);

			$prefs = wp_parse_args( $prefs, $defaults );
			if ( ! is_array( $prefs['models'] ) ) {
				$prefs['models'] = array();
			}

			return $prefs;
		}

		/**
		 * Last used AI provider (site-wide default for new conversations).
		 *
		 * @return string
		 */
		public static function get_last_provider() {
			$prefs    = self::get_prefs();
			$provider = sanitize_key( (string) $prefs['last_provider'] );
			return $provider ? $provider : 'wp';
		}

		/**
		 * Save last-used agent and model for that provider.
		 *
		 * @param string $provider Provider slug.
		 * @param string $model    Model id.
		 */
		public static function save_model_preference( $provider, $model ) {
			$provider = sanitize_key( (string) $provider );
			if ( '' === $provider ) {
				return;
			}

			$prefs                  = self::get_prefs();
			$prefs['last_provider'] = $provider;

			if ( $model ) {
				if ( ! isset( $prefs['models'] ) || ! is_array( $prefs['models'] ) ) {
					$prefs['models'] = array();
				}
				$prefs['models'][ $provider ] = sanitize_text_field( (string) $model );
			}

			update_option( self::OPTION_PREFS, $prefs, false );
		}

		/**
		 * Last saved model for a provider.
		 *
		 * @param string $provider Provider slug.
		 * @return string
		 */
		public static function get_last_model_for_provider( $provider ) {
			$provider = sanitize_key( (string) $provider );
			if ( '' === $provider ) {
				return '';
			}

			$prefs = self::get_prefs();
			return isset( $prefs['models'][ $provider ] ) ? (string) $prefs['models'][ $provider ] : '';
		}

		// ── Import ────────────────────────────────────────────────────────────

		/**
		 * Bulk import messages (localStorage migration — one-time use).
		 *
		 * @param string $widget_id Widget id.
		 * @param array  $data      { messages, provider, model }.
		 * @return int Number of messages imported.
		 */
		public static function import_history( $widget_id, array $data ) {
			$messages = isset( $data['messages'] ) && is_array( $data['messages'] ) ? $data['messages'] : array();
			if ( empty( $messages ) ) {
				return 0;
			}

			// Only import if the widget has no conversations yet.
			$existing = self::get_conversations_for_widget( $widget_id );
			if ( ! empty( $existing ) ) {
				return 0;
			}

			$conversation_id = self::create_conversation( $widget_id, 0, '' );
			if ( ! $conversation_id ) {
				return 0;
			}

			$provider = isset( $data['provider'] ) ? (string) $data['provider'] : 'wp';
			$model    = isset( $data['model'] ) ? (string) $data['model'] : '';
			$count    = 0;

			foreach ( $messages as $msg ) {
				if ( ! is_array( $msg ) || empty( $msg['role'] ) ) {
					continue;
				}
				$msg['provider'] = isset( $msg['provider'] ) ? $msg['provider'] : $provider;
				$msg['model']    = isset( $msg['model'] ) ? $msg['model'] : $model;
				if ( self::insert_message( $conversation_id, $msg ) ) {
					++$count;
				}
			}

			if ( $model ) {
				self::save_model_preference( $provider, $model );
			}

			return $count;
		}

		// ── Legacy migration ──────────────────────────────────────────────────

		/**
		 * Migrate legacy wp_protuno_chat_settings → protuno_chat_prefs option, then drop that table.
		 */
		private static function migrate_legacy_settings_to_option() {
			global $wpdb;

			$legacy_table = $wpdb->prefix . 'protuno_chat_settings';
			$migrated     = (bool) get_option( self::OPTION_PREFS_MIGRATED, false );

			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$table_exists = ( $wpdb->get_var( "SHOW TABLES LIKE '{$legacy_table}'" ) === $legacy_table );

			if ( $table_exists && ! $migrated ) {
				$prefs = self::get_prefs();
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$rows  = $wpdb->get_results( "SELECT setting_key, setting_value FROM {$legacy_table}", ARRAY_A );

				foreach ( (array) $rows as $row ) {
					$key   = isset( $row['setting_key'] ) ? (string) $row['setting_key'] : '';
					$value = isset( $row['setting_value'] ) ? (string) $row['setting_value'] : '';
					if ( '' === $key || '' === $value ) {
						continue;
					}

					if ( 0 === strpos( $key, 'last_model_' ) ) {
						$slug = substr( $key, strlen( 'last_model_' ) );
						if ( $slug ) {
							$prefs['models'][ sanitize_key( $slug ) ] = $value;
						}
						continue;
					}

					if ( 'last_provider_wp' === $key ) {
						$prefs['last_provider'] = sanitize_key( $value );
					}
				}

				foreach ( (array) $rows as $row ) {
					$key = isset( $row['setting_key'] ) ? (string) $row['setting_key'] : '';
					if ( 0 === strpos( $key, 'last_provider_' ) && 'last_provider_wp' !== $key ) {
						$slug = substr( $key, strlen( 'last_provider_' ) );
						if ( $slug ) {
							$prefs['last_provider'] = sanitize_key( $slug );
						}
					}
				}

				update_option( self::OPTION_PREFS, $prefs, false );
			}

			if ( $table_exists ) {
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$wpdb->query( "DROP TABLE IF EXISTS `{$legacy_table}`" );
			}

			if ( ! $migrated ) {
				update_option( self::OPTION_PREFS_MIGRATED, 1, false );
			}
		}
	}
}
