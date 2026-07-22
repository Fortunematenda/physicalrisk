<?php

namespace MetForm\Core\Integrations\Onboard\Classes;

defined( 'ABSPATH' ) || exit;

class Ajax {
	
	private $utils;

	public function __construct() {
		add_action( 'wp_ajax_mf_admin_action', [ $this, 'metform_admin_action' ] );
		add_action( 'wp_ajax_mf_onboard_plugins', array( $this, 'metform_onboard_plugins' ) );
		$this->utils = Utils::instance();
	}

	public function metform_admin_action() {
		// Check for nonce security
		if (!isset( $_POST['nonce'] ) || ! wp_verify_nonce( sanitize_text_field(wp_unslash($_POST['nonce'])), 'ajax-nonce' ) ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		if ( isset( $_POST['user_data'] ) ) {
			$this->utils->save_option( 'user_data', empty( $_POST['user_data'] ) ? [] : sanitize_text_field(wp_unslash($_POST['user_data'])));
		}

		if ( isset( $_POST['settings'] ) ) {
			//phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- Sanitized using map_deep
			$this->utils->save_settings( map_deep($_POST['settings'],function($data){
				return sanitize_text_field(wp_unslash($data));
			}));
		}


		do_action( 'metform/admin/after_save' );

		$response = array(
			'message' => self::plugin_activate_message( 'setup_configurations' )
		);

		$plugins = !empty($_POST['our_plugins']) && is_array($_POST['our_plugins']) ? $_POST['our_plugins'] : [];
		if($plugins) {
			$total_plugins = count($plugins);
			$total_steps   = 1 + $total_plugins;
			$percentage = ($total_steps > 0) ? (1 / $total_steps) * 100 : 100;
			$percentage = round($percentage);

			$response['progress'] = $percentage;
			$response['plugins'] = $plugins;
		}

		wp_send_json($response);

		wp_die(); // this is required to terminate immediately and return a proper response
	}

	public function metform_onboard_plugins() {
		// Check for nonce security
		if (!isset( $_POST['nonce'] ) || ! wp_verify_nonce( sanitize_text_field(wp_unslash($_POST['nonce'])), 'ajax-nonce' ) ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$plugin_slug = isset( $_POST['plugin_slug'] ) ? sanitize_text_field(wp_unslash($_POST['plugin_slug'])) : '';
		if ( isset( $plugin_slug ) && current_user_can('install_plugins') ) {
			$status = \MetForm\Core\Integrations\Onboard\Classes\Plugin_Installer::single_install_and_activate( $plugin_slug );
			if ( is_wp_error( $status ) ) {
				wp_send_json_error( array( 'status' => false ) );
			} else {
				wp_send_json_success(
					array(
						'message' => self::plugin_activate_message( $plugin_slug )
					)
				);
			}
		}
	}


	public static function plugin_activate_message($plugin_slug) {
		$plugins_message = [
			'setup_configurations' => esc_html__('Setup Configurations', 'metform'),
			'elementskit-lite/elementskit-lite.php' => esc_html__('Page Builder Elements Activated', 'metform'),
			'getgenie/getgenie.php' => esc_html__('AI Content & SEO Tool Activated', 'metform'),
			'shopengine/shopengine.php' => esc_html__('WooCommerce Builder Activated', 'metform'),
			'metform/metform.php' => esc_html__('Form Builder Activated', 'metform'),
			'emailkit/EmailKit.php' => esc_html__('Email Customizer Activated', 'metform'),
			'wp-fundraising-donation/wp-fundraising.php' => esc_html__('Fundraising & Donations', 'metform'),
			'gutenkit-blocks-addon/gutenkit-blocks-addon.php' => esc_html__('Page Builder Blocks Activated', 'metform'),
			'popup-builder-block/popup-builder-block.php' => esc_html__('Popup Builder Activated', 'metform'),
			'table-builder-block/table-builder-block.php' => esc_html__('Table Builder Activated', 'metform')
		];

		if ( array_key_exists( $plugin_slug, $plugins_message ) ) {
			return esc_html( $plugins_message[$plugin_slug] );
		} else {
			return esc_html__( 'Plugin Activated', 'metform' );
		}
	}

	public function return_json( $data ) {
		if ( is_array( $data ) || is_object( $data ) ) {
			return json_encode( $data );
		} else {
			return $data;
		}
	}

}