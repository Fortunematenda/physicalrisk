<?php
/**
 * Loads the Proton composer editor JavaScript and CSS in the Elementor editor.
 *
 * @link       https://posimyth.com/
 * @since      1.0.0
 *
 * @package    Protuno
 */

/**
 * Exit if accessed directly.
 * */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Composer_Enqueue' ) ) {

	/**
	 * Enqueues the Proton editor panel + React composer assets.
	 */
	class Protuno_Composer_Enqueue {

		/**
		 * Initialize the class and set its properties.
		 *
		 * @since   1.0.0
		 */
		public function __construct() {
			add_action( 'elementor/editor/after_enqueue_scripts', array( $this, 'enqueue_proton_editor_script' ) );
		}

		/**
		 * Enqueue the Proton editor scripts/styles inside the Elementor editor.
		 *
		 * @return void
		 */
		public function enqueue_proton_editor_script() {
			if ( ! class_exists( '\Elementor\Plugin' ) || ! \Elementor\Plugin::$instance->editor->is_edit_mode() ) {
				return;
			}

			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return;
			}

			$html_editor_settings = wp_enqueue_code_editor(
				array(
					'type' => 'text/html',
				)
			);
			$css_editor_settings  = wp_enqueue_code_editor(
				array(
					'type' => 'text/css',
				)
			);
			$js_editor_settings   = wp_enqueue_code_editor(
				array(
					'type' => 'application/javascript',
				)
			);

			wp_enqueue_style( 'wp-codemirror' );
			wp_enqueue_style( 'code-editor' );
			wp_enqueue_script( 'code-editor' );
			wp_enqueue_script( 'wp-theme-plugin-editor' );

			$panel_css = PROTUNO_PATH . 'assets/css/protuno-proton-editor-panel.css';
			wp_enqueue_style(
				'protuno-proton-editor-panel',
				PROTUNO_URL . 'assets/css/protuno-proton-editor-panel.css',
				array(),
				file_exists( $panel_css ) ? filemtime( $panel_css ) : PROTUNO_VERSION
			);

			$js_base = PROTUNO_PATH . 'assets/js/';
			wp_enqueue_script(
				'protuno-proton-editor-registry',
				PROTUNO_URL . 'assets/js/protuno-proton-editor-registry.js',
				array( 'jquery' ),
				filemtime( $js_base . 'protuno-proton-editor-registry.js' ),
				true
			);

			$panel_html_path = PROTUNO_PATH . 'assets/html/protuno-proton-editor-panel.html';
			$panel_html      = '';
			if ( is_readable( $panel_html_path ) ) {
				$panel_html = file_get_contents( $panel_html_path );
				if ( ! is_string( $panel_html ) ) {
					$panel_html = '';
				}
			}

			$uploads_base = '';
			if ( class_exists( 'Protuno_Chat_Uploads' ) ) {
				$uploads_base = trailingslashit( \Protuno_Chat_Uploads::get_base_url() );
			} else {
				$upload_dir = wp_upload_dir();
				if ( empty( $upload_dir['error'] ) ) {
					$uploads_base = trailingslashit( $upload_dir['baseurl'] ) . 'protuno/chat/';
				}
			}

			$uploads_dir = '';
			if ( class_exists( 'Protuno_Chat_Uploads' ) ) {
				$uploads_dir = \Protuno_Chat_Uploads::get_base_dir();
			} else {
				$upload_dir = wp_upload_dir();
				if ( empty( $upload_dir['error'] ) ) {
					$uploads_dir = trailingslashit( $upload_dir['basedir'] ) . 'protuno/chat';
				}
			}

			$wp_agent_config = array(
				'turnUrl'        => rest_url( 'protuno/v1/agent/turn' ),
				'modelsUrl'      => rest_url( 'protuno/v1/agent/models' ),
				'historyUrl'     => rest_url( 'protuno/v1/chat/history' ),
				'messageUrl'     => rest_url( 'protuno/v1/chat/message' ),
				'uploadUrl'      => rest_url( 'protuno/v1/chat/upload' ),
				'importUrl'      => rest_url( 'protuno/v1/chat/import' ),
				'modelUrl'       => rest_url( 'protuno/v1/chat/model' ),
				'uploadsBaseUrl' => $uploads_base,
				'uploadsDir'     => $uploads_dir,
				'siteUrl'        => home_url(),
				'restNonce'      => wp_create_nonce( 'wp_rest' ),
				'aiSupported'    => function_exists( 'wp_supports_ai' ) && wp_supports_ai(),
			);

			wp_localize_script(
				'protuno-proton-editor-registry',
				'uichComposerEditorCfg',
				array(
					'html'           => $html_editor_settings,
					'css'            => $css_editor_settings,
					'js'             => $js_editor_settings,
					'pageCode'       => $html_editor_settings,
					'siteCodeEditor' => $html_editor_settings,
					'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
					'ajaxNonce'      => wp_create_nonce( \Protuno_Proton_Manager::EDITOR_AJAX_NONCE_ACTION ),
					'siteCode'       => \Protuno_Proton_Manager::get_site_custom_code_option(),
					'wpAgent'        => $wp_agent_config,
					'panelHtml'      => $panel_html,
				)
			);

			wp_enqueue_script(
				'protuno-proton-editor-helpers',
				PROTUNO_URL . 'assets/js/protuno-proton-editor-helpers.js',
				array(
					'protuno-proton-editor-registry',
					'code-editor',
					'wp-theme-plugin-editor',
				),
				filemtime( $js_base . 'protuno-proton-editor-helpers.js' ),
				true
			);
			wp_enqueue_script(
				'protuno-proton-editor-panel',
				PROTUNO_URL . 'assets/js/protuno-proton-editor-panel.js',
				array( 'protuno-proton-editor-helpers' ),
				filemtime( $js_base . 'protuno-proton-editor-panel.js' ),
				true
			);
			wp_enqueue_script(
				'protuno-proton-editor',
				PROTUNO_URL . 'assets/js/protuno-proton-editor.js',
				array( 'jquery', 'protuno-proton-editor-panel' ),
				filemtime( $js_base . 'protuno-proton-editor.js' ),
				true
			);

			wp_enqueue_script(
				'protuno-proton-wp-agent',
				PROTUNO_URL . 'assets/js/protuno-proton-wp-agent.js',
				array( 'protuno-proton-editor' ),
				filemtime( $js_base . 'protuno-proton-wp-agent.js' ),
				true
			);

			// Enqueue chat (WordPress provider works without claude-agent sidecar).
			wp_enqueue_script(
				'protuno-proton-chat',
				PROTUNO_URL . 'assets/js/protuno-proton-chat.js',
				array( 'jquery', 'protuno-proton-editor', 'protuno-proton-wp-agent' ),
				filemtime( $js_base . 'protuno-proton-chat.js' ),
				true
			);

			$this->enqueue_proton_react();
		}

		/**
		 * Enqueue the React composer build that mounts into the floating panel shell.
		 *
		 * @return void
		 */
		public function enqueue_proton_react() {
			// The React composer includes a localhost-only agent bridge. Only load
			// that development client when WordPress itself uses a loopback host.
			$site_host = wp_parse_url( home_url(), PHP_URL_HOST );
			if ( ! in_array( $site_host, array( 'localhost', '127.0.0.1' ), true ) ) {
				return;
			}

			$build_dir  = PROTUNO_PATH . 'proton/build/';
			$build_url  = PROTUNO_URL . 'proton/build/';
			$asset_file = $build_dir . 'index.asset.php';
			$js_file    = $build_dir . 'index.js';
			$css_file   = $build_dir . 'index.css';

			if ( ! file_exists( $js_file ) || ! file_exists( $asset_file ) ) {
				return;
			}

			$asset   = include $asset_file;
			$deps    = isset( $asset['dependencies'] ) && is_array( $asset['dependencies'] ) ? $asset['dependencies'] : array();
			$version = isset( $asset['version'] ) ? $asset['version'] : filemtime( $js_file );
			$css_url = file_exists( $css_file ) ? $build_url . 'index.css' : '';
			$css_ver = file_exists( $css_file ) ? filemtime( $css_file ) : PROTUNO_VERSION;

			if ( $css_url ) {
				wp_enqueue_style(
					'protuno-proton-composer',
					$css_url,
					array(),
					$css_ver
				);
			}

			wp_enqueue_script(
				'protuno-proton-composer',
				$build_url . 'index.js',
				$deps,
				$version,
				true
			);

			wp_localize_script(
				'protuno-proton-composer',
				'uichComposerCfg',
				array(
					'cssUrl'           => $css_url,
					'ajaxUrl'          => admin_url( 'admin-ajax.php' ),
					'ajaxNonce'        => class_exists( '\Protuno_Proton_Manager' )
						? wp_create_nonce( \Protuno_Proton_Manager::EDITOR_AJAX_NONCE_ACTION )
						: '',
					'settingsUrl'      => admin_url( 'admin.php?page=protuno' ),
					'connectorsUrl'    => admin_url( 'options-connectors.php' ),
					'containerWidths'  => class_exists( '\Protuno_Globals' )
						? \Protuno_Globals::get_elementor_container_breakpoints_width()
						: null,
					'atomicEnabled'    => class_exists( '\Elementor\Plugin' )
						&& \Elementor\Plugin::$instance->experiments
						&& method_exists( \Elementor\Plugin::$instance->experiments, 'is_feature_active' )
						&& (bool) \Elementor\Plugin::$instance->experiments->is_feature_active( 'e_atomic_elements' ),
					'atomicWidthClass' => ( class_exists( 'Protuno_Atomic_Globals' ) && class_exists( '\Elementor\Plugin' ) )
						? \Protuno_Atomic_Globals::get_elementor_width_class()
						: null,
				)
			);
		}
	}

	new Protuno_Composer_Enqueue();
}
