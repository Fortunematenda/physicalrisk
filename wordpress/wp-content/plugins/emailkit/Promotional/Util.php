<?php
namespace EmailKit\Promotional;

defined( 'ABSPATH' ) || exit;
/**
 * Global helper class.
 *
 * @since 1.0.0
 */

class Util{

	public static $instance = null;
	private static $key     = 'emailkit_options';
	
	public static function get_option( $key, $default = '' ) {
		$data_all = get_option( self::$key );
		return ( isset( $data_all[ $key ] ) && $data_all[ $key ] != '' ) ? $data_all[ $key ] : $default;
	}

	public static function save_option( $key, $value = '' ) {
		$data_all         = get_option( self::$key ) ?? [];
		$data_all[ $key ] = $value;
		return update_option(  self::$key, $data_all );
	}

	public static function get_settings( $key, $default = '' ) {
		$data_all = self::get_option( 'settings', array() );
		return ( isset( $data_all[ $key ] ) && $data_all[ $key ] != '' ) ? $data_all[ $key ] : $default;
	}

	public static function save_settings( $new_data = '' ) {
		$data_old = self::get_option( 'settings', array() );
		$data     = array_merge( $data_old, $new_data );
		return self::save_option( 'settings', $data );
	}

	public static function emailkit_admin_action() {
		// Check for nonce security
		$status = '';
		
		if (!isset($_POST['nonce']) || ! wp_verify_nonce( sanitize_key(wp_unslash($_POST['nonce'])), 'ajax-nonce' ) ) {
			return;
		}
		

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

	
		if ( isset( $_POST['settings'] ) ) {
			$status = self::save_settings( empty( $_POST['settings'] ) ? array() : map_deep( wp_unslash( $_POST['settings'] ) , 'sanitize_text_field' )  ); 
		}

		if($status){
			wp_send_json_success();
		}else{
			wp_send_json_error();
		}
		exit;
	}

	/**
	 * AJAX action specifically for copy-paste feature
	 * Handles enabling/disabling copy-paste functionality with Pro validation
	 */
	public static function emailkit_copy_paste_action() {
		// Check for nonce security
		if (!isset($_POST['nonce']) || ! wp_verify_nonce( sanitize_key(wp_unslash($_POST['nonce'])), 'ajax-nonce' ) ) {
			wp_send_json_error(['message' => 'Security check failed']);
			exit;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error(['message' => 'Insufficient permissions']);
			exit;
		}

		// Check if EmailKit Pro is active
		$is_pro_active = is_plugin_active('emailkit-pro/emailkit-pro.php');
		
		if (!$is_pro_active) {
			wp_send_json_error(['message' => 'EmailKit Pro is required for copy-paste feature']);
			exit;
		}

		// Get the copy-paste setting value
		$copy_paste_value = isset($_POST['copy_paste_enabled']) ? sanitize_text_field(wp_unslash($_POST['copy_paste_enabled'])) : 'no';
		
		// Validate value
		if (!in_array($copy_paste_value, ['yes', 'no'])) {
			wp_send_json_error(['message' => 'Invalid value provided']);
			exit;
		}

		// Save the setting
		$status = self::save_settings(['emailkit_enable_copy_paste' => $copy_paste_value]);

		if ($status) {
			wp_send_json_success([
				'message' => 'Copy-paste setting updated successfully',
				'value' => $copy_paste_value
			]);
		} else {
			wp_send_json_error(['message' => 'Failed to save setting']);
		}
		exit;
	}

	public static function instance() {
		if ( is_null( self::$instance ) ) {

			// Fire the class instance
			self::$instance = new self();
		}

		return self::$instance;
	}

   
    /**
     * Get emailkit older version if has any.
     *
     * @since 1.0.0
     * @access public
     */
    public static function old_version(){
        $version = get_option('emailkit_version');
        return null == $version ? -1 : $version;
    }

	public static function array_push_assoc($array, $key, $value){
		$array[$key] = $value;
		return $array;
	}

	public static function render($content){
		if (stripos($content, "emailkit-has-lisence") !== false) {
			return null;
		}

		return $content;
	}

	public static function get_form_settings($key){
		$options = get_option('emailkit_option__settings');
		return isset($options[$key]) ? $options[$key] : '';
	}
	public static function emailkit_content_renderer($content){
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo $content;
	}
}
