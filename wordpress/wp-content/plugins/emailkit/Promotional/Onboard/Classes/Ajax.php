<?php

namespace EmailKit\Promotional\Onboard\Classes;
use \EmailKit\Promotional\Util;

defined( 'ABSPATH' ) || exit;

class Ajax {
	
	
	private $utils;

	public function __construct() {
		add_action( 'wp_ajax_emailkit_admin_action', [ $this, 'emailkit_admin_action' ] );
		add_action( 'wp_ajax_emailkit_copy_paste_action', ['\EmailKit\Promotional\Util', 'emailkit_copy_paste_action'] );
		$this->utils = Util::instance();
	}

	public function emailkit_admin_action() {
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


		do_action( 'emailkit/admin/after_save' );

		exit;
	}

	public function return_json( $data ) {
		if ( is_array( $data ) || is_object( $data ) ) {
			return json_encode( $data );
		} else {
			return $data;
		}
	}

}