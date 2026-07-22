<?php

namespace Gutenkit\Routes;

defined('ABSPATH') || exit;

class DeactivationFeedback {

	public function __construct() {
		add_action( 'rest_api_init', array( $this, 'deactivation_feedback' ) );
	}

	public function deactivation_feedback() {
		register_rest_route(
			'gutenkit/v1',
			'/deactivation-feedback',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle_feedback' ),
				'permission_callback' => array( $this, 'permission_check' ),
				'args' => array(
					'reason_key' => array(
						'required' => true,
						'sanitize_callback' => 'sanitize_text_field'
					),
					'reason_label' => array(
						'required' => true,
						'sanitize_callback' => 'sanitize_text_field'
					),
					'message' => array(
						'required' => false,
						'sanitize_callback' => 'sanitize_textarea_field'
					),
				),
			)
		);
	}

	public function permission_check() {
		return current_user_can( 'manage_options' );
	}

	public function handle_feedback( $request ) {
		$params = $request->get_json_params();

		$data = array(
			'plugin_slug'    => 'gutenkit-blocks-addon',
			'plugin_name'    => 'GutenKit',
			'plugin_version' => defined( 'GUTENKIT_PLUGIN_VERSION' ) ? GUTENKIT_PLUGIN_VERSION : '',
			'user'           => array(
				'email' => get_option( 'gutenkit_onboard_email_id' ),
			),
			'feedback'       => array(
				'reason_key'   => $params['reason_key'],
				'reason_label' => $params['reason_label'],
				'message'      => isset( $params['message'] ) ? $params['message'] : '',
			),
			'usage'          => array(
				'active_widgets' => $this->get_active_widgets(),
				'active_modules' => $this->get_active_modules(),
				'user_type'      => $this->get_user_type(),
				'active_days'    => $this->get_days_active(),
			),
			'environment'    => array(
				'multisite_status'   => is_multisite(),
				'wp_version'         => get_bloginfo( 'version' ),
				'php_version'        => PHP_VERSION,
				'elementor_version'  => defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : '',
				'site_url'           => get_site_url(),
			),
		);

		wp_remote_post(
			'https://api.wpmet.com/public/plugin-unsubscribe/',
			array(
				'method'    => 'POST',
				'timeout'   => 20,
				'blocking'  => false,
				'headers'   => array( 'Content-Type' => 'application/json' ),
				'body'      => wp_json_encode( $data ),
			)
		);

		return new \WP_REST_Response( array( 'success' => true ), 200 );
	}

	/**
	 * Get the list of active GutenKit blocks (widgets).
	 *
	 * @return array Slugs of the currently active blocks.
	 */
	public function get_active_widgets() {
		if ( ! class_exists( '\Gutenkit\Config\BlockList' ) ) {
			return array();
		}

		$active_blocks = \Gutenkit\Config\BlockList::instance()->get_list( 'active' );

		return is_array( $active_blocks ) ? array_keys( $active_blocks ) : array();
	}

	/**
	 * Get the list of active modules.
	 *
	 * @return array Slugs of the currently active modules.
	 */
	public function get_active_modules() {
		if ( ! class_exists( '\Gutenkit\Config\Modules' ) ) {
			return array();
		}

		$active_modules = \Gutenkit\Config\Modules::get_active_modules_list();

		return is_array( $active_modules ) ? array_keys( $active_modules ) : array();
	}

	/**
	 * Determine the user type based on the pro plugin and license status.
	 *
	 * @return string One of 'pro_valid', 'pro' or 'free'.
	 */
	public function get_user_type() {
		// First check whether the Pro plugin is installed at all.
		// A user without Pro installed is always 'free'.
		if ( ! $this->is_pro_installed() ) {
			return 'free';
		}

		$is_licensed = class_exists( '\Gutenkit\Helpers\Utils' )
			&& \Gutenkit\Helpers\Utils::status() === 'valid';

		return $is_licensed ? 'pro_valid' : 'pro';
	}

	/**
	 * Check whether the GutenKit Pro plugin is installed (regardless of active state).
	 *
	 * @return bool True if the Pro plugin file exists in the plugins directory.
	 */
	protected function is_pro_installed() {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		return array_key_exists( 'gutenkit-blocks-addon-pro/gutenkit-blocks-addon-pro.php', get_plugins() );
	}

	/**
	 * Get the number of days the plugin has been active since install.
	 *
	 * @return int Number of full days since installation.
	 */
	public function get_days_active() {
		$installed_time = (int) get_option( 'gutenkit_installed_time', 0 );

		if ( empty( $installed_time ) ) {
			return 0;
		}

		return (int) floor( ( time() - $installed_time ) / DAY_IN_SECONDS );
	}
}
