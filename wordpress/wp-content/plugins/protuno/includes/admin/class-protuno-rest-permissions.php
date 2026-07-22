<?php
/**
 * Central permission callback for all Protuno REST routes.
 *
 * Every REST route is admin-only (`manage_options`). Authentication
 * happens via the native WordPress Application Passwords flow
 * (HTTP Basic auth) handled by `wp_authenticate_application_password`.
 *
 * @package Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Rest_Permissions' ) ) {

	class Protuno_Rest_Permissions {

		/**
		 * Admin-only permission gate used by every Protuno REST route.
		 * Passes when the current user can manage_options (administrator),
		 * authenticated either via cookie + nonce or via an Application
		 * Password sent as HTTP Basic auth.
		 *
		 * @param WP_REST_Request $request Request.
		 * @return bool|WP_Error
		 */
		public static function check_admin( WP_REST_Request $request ) {
			if ( current_user_can( 'manage_options' ) ) {
				return true;
			}
			return new WP_Error(
				'rest_forbidden',
				__( 'Sorry, only administrators can use Protuno endpoints.', 'protuno' ),
				array( 'status' => 403 )
			);
		}
	}
}
