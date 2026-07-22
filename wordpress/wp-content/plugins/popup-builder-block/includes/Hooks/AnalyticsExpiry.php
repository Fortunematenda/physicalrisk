<?php

namespace PopupBuilderBlock\Hooks;

defined( 'ABSPATH' ) || exit;

use PopupBuilderBlock\Helpers\DataBase;

class AnalyticsExpiry {

	public function __construct() {
		add_action( 'pbb_analytics_expiry_clean', array( $this, 'check_expiry' ) );
		$this->schedule_event();
	}

	public function schedule_event() {
		if ( ! wp_next_scheduled( 'pbb_analytics_expiry_clean' ) ) {
			wp_schedule_event( time(), 'weekly', 'pbb_analytics_expiry_clean' );
		}
	}

	public function check_expiry() {
		$settings = get_option( 'pbb-settings-tabs' );
		$expiry   = isset( $settings['analytics'] ) ? $settings['analytics']['value'] : 2;

		if ( $expiry === 'forever' ) {
			return;
		}

		DataBase::deleteExpiredData( array( 'expire_time' => $expiry ) );
	}
}
