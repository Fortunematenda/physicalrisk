<?php

namespace EmailKit\Promotional\Onboard;

use \EmailKit\Traits\Singleton;
use \EmailKit\Promotional\Onboard\Classes\PluginDataSender;
use \EmailKit\Promotional\Util;

defined( 'ABSPATH' ) || exit;

class Onboard {

	use Singleton;
	protected  $optionKey = 'emailkit_onboard_status';
	protected  $optionValue = 'onboarded';

	const CONTACT_LIST_ID = 2;
	const ENVIRONMENT_ID = 2;

	public function views() {
		?>
			<div class="emailkit-onboard-dashboard">
				<div class="emailkit_container">
					<form action="" method="POST" id="emailkit-admin-settings-form">
						<?php
							include self::get_dir().'views/layout-onboard.php';
						?>
					</form>
				</div>
			</div>
		<?php
	}

	public static function get_dir() {
		return EMAILKIT_DIR . 'Promotional/Onboard/';
	}

	public static function get_url(){
        return EMAILKIT_URL . 'Promotional/Onboard/';
    }

	public function init() {
		
		new Classes\Ajax;

		if ( get_option( $this->optionKey ) ) {
			//phpcs:disable WordPress.Security.NonceVerification -- its just checking emailkit-onboard-steps is finished or not.
			if(isset($_GET['emailkit-onboard-steps'])) {
				wp_safe_redirect($this->get_plugin_url());
			}
			return true;
		}
	
		add_action('emailkit/admin/after_save', [$this, 'ajax_action']);

		$param      = isset( $_GET['emailkit-onboard-steps'] ) ?  sanitize_text_field(wp_unslash($_GET['emailkit-onboard-steps'])) : null;
		$requestUri = ( isset( $_GET['post_type'] ) ?  sanitize_text_field(wp_unslash($_GET['post_type'])) : '' ) . ( isset( $_GET['page'] ) ?  sanitize_text_field(wp_unslash($_GET['page'])) : '' );
		//phpcs:enable
		if ( strpos( $requestUri, 'emailkit' ) !== false && is_admin() ) {
			if ( $param !== 'loaded' && ! get_option( $this->optionKey ) ) {
				wp_safe_redirect( $this->get_onboard_url() );
				exit;
			}
		}

		return true;
	}

	public  function ajax_action(){
		$this->finish_onboard();
		if( isset($_POST['nonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['nonce'])),'ajax-nonce')){
	
			if ( isset( $_POST['settings']['tut_term'] ) &&  sanitize_text_field(wp_unslash($_POST['settings']['tut_term'])) == 'user_agreed' ) {
				$data = PluginDataSender::instance()->send( 'diagnostic-data' ); // send non-sensitive diagnostic data and details about plugin usage.
			}

			if ( isset( $_POST['settings']['newsletter_email'] ) && !empty($_POST['settings']['newsletter_email'])) {
				$data = [
					'email'           =>  sanitize_text_field(wp_unslash($_POST['settings']['newsletter_email'])),
					'environment_id'  => Onboard::ENVIRONMENT_ID,
					'contact_list_id' => Onboard::CONTACT_LIST_ID,
				];

				$response = PluginDataSender::instance()->sendAutomizyData( 'email-subscribe', $data);
				Util::emailkit_content_renderer(print_r($response));
				exit;
			}
		}
	}

	private  function get_onboard_url() {
		return add_query_arg(
			array(
				'page'               		=> 'emailkit-menu-settings',
				'emailkit-onboard-steps' 		=> 'loaded',
				'emailkit-onboard-steps-nonce'	=> wp_create_nonce('emailkit-onboard-steps-action')
			),
			admin_url( 'admin.php' )
		);
	}

	public function redirect_onboard() {
		if (is_null(get_option( $this->optionKey ) )) {
			wp_safe_redirect( $this->get_onboard_url() );
			exit;
		}
	}

	private static function get_plugin_url() {
		return add_query_arg(
			array(
				'page' => 'emailkit-menu-settings',
			),
			admin_url( 'admin.php' )
		);
	}

	public function finish_onboard() {
		if ( ! get_option( $this->optionKey ) ) {
			add_option( $this->optionKey,  $this->optionValue );
		}
	}
}