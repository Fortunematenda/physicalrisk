<?php

/**
 * Fired during plugin activation
 *
 * @link       https://posimyth.com
 * @since      1.0.0
 *
 * @package    Protuno
 * @subpackage Protuno/includes
 */

/**
 * Fired during plugin activation.
 *
 * This class defines all code necessary to run during the plugin's activation.
 *
 * @since      1.0.0
 * @package    Protuno
 * @subpackage Protuno/includes
 * @author     Posimyth <posimyth@gmail.com>
 */
class Protuno_Activator {

	/**
	 * Runs on plugin activation.
	 *
	 * Installs the Proton chat database tables and ensures the chat upload
	 * directories exist.
	 *
	 * @since    1.0.0
	 */
	public static function activate() {
		require_once PROTUNO_PATH . 'includes/chat/class-protuno-chat-db.php';
		require_once PROTUNO_PATH . 'includes/chat/class-protuno-chat-uploads.php';

		if ( class_exists( 'Protuno_Chat_DB' ) ) {
			Protuno_Chat_DB::install();
		}

		if ( class_exists( 'Protuno_Chat_Uploads' ) ) {
			Protuno_Chat_Uploads::ensure_directories();
		}
	}

}
