<?php

namespace PopupBuilderBlock\Routes;

defined('ABSPATH') || exit;

class DeactivationFeedback extends Api {

	protected function get_routes(): array {
        return [
            [
                'endpoint'            => '/deactivation-feedback',
                'methods'             => 'POST',
                'callback'            => 'handle_feedback',
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
			],
        ];
    }

	public function handle_feedback( $request ) {
		$params = $request->get_json_params();

		$data = array(
			'plugin_slug'    => 'popup-builder-block',
			'plugin_name'    => 'PopupKit',
			'plugin_version' => defined( 'POPUP_BUILDER_BLOCK_PLUGIN_VERSION' ) ? POPUP_BUILDER_BLOCK_PLUGIN_VERSION : '',
			'user'           => array(
				'email' => $this->get_user_email(),
			),
			'feedback'       => array(
				'reason_key'   => $params['reason_key'],
				'reason_label' => $params['reason_label'],
				'message'      => isset( $params['message'] ) ? $params['message'] : '',
			),
			'usage'          => array(
				'active_widgets' => $this->get_active_widgets(),
				'active_modules' => array(), // Placeholder for future module tracking
				'user_type'      => $this->get_user_type(),
				'active_days'    => $this->get_days_active(),
			),
			'environment'    => array(
				'multisite_status'   => is_multisite(),
				'wp_version'         => get_bloginfo( 'version' ),
				'php_version'        => PHP_VERSION,
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
	 * Get the email of the user who is providing feedback.
	 *
	 * @return string|null The user's email or null if not available.
	 */
	public function get_user_email() {
		// Attempt to retrieve the email from the onboard option.
		$email = get_option( 'popupkit_onboard_email' );
		return is_email( $email ) ? $email : '';
	}

	/**
	 * Get the list of active PopupKit blocks (widgets).
	 *
	 * @return array Slugs of the currently active blocks.
	 */
	public function get_active_widgets() {
		if ( ! class_exists( '\PopupBuilderBlock\Config\BlockList' ) ) {
			return array();
		}

		$blocks = \PopupBuilderBlock\Config\BlockList::get_block_list();

		if ( ! is_array( $blocks ) ) {
			return array();
		}

		$active_blocks = array_filter(
			$blocks,
			function ( $block ) {
				return isset( $block['status'] ) && 'active' === $block['status'];
			}
		);

		return array_keys( $active_blocks );
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

		$is_licensed = class_exists( '\PopupBuilderBlock\Helpers\Utils' )
			&& \PopupBuilderBlock\Helpers\Utils::status() === 'valid';

		return $is_licensed ? 'pro_valid' : 'pro';
	}

	/**
	 * Check whether the PopupKit Pro plugin is installed (regardless of active state).
	 *
	 * @return bool True if the Pro plugin file exists in the plugins directory.
	 */
	protected function is_pro_installed() {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		return array_key_exists( 'popup-builder-block-pro/popup-builder-block-pro.php', get_plugins() );
	}

	/**
	 * Get the number of days the plugin has been active since install.
	 *
	 * @return int Number of full days since installation.
	 */
	public function get_days_active() {
		$installed_time = (int) get_option( 'popupkit_installed_time', 0 );

		if ( empty( $installed_time ) ) {
			return 0;
		}

		return (int) floor( ( time() - $installed_time ) / DAY_IN_SECONDS );
	}
}
