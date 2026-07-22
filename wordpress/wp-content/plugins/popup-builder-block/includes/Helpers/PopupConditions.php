<?php
namespace PopupBuilderBlock\Helpers;

defined( 'ABSPATH' ) || exit;

class PopupConditions {
	private $current_post_id;
	private $popup_id;
	private $post_type = 'popupkit-campaigns';
	private $post_meta;

	public function __construct( $popup_id, $current_post_id ) {
		$this->popup_id        = $popup_id;
		$this->current_post_id = $current_post_id;
		$this->post_meta       = $this->get_clean_post_meta( $popup_id );
	}

	/**
	 * Get all post meta with single unserialized values.
	 *
	 * @param int $post_id The post ID.
	 * @return array Associative array of meta key => value.
	 */
	private function get_clean_post_meta( $post_id ) {
		$raw_meta = get_post_meta( $post_id );
		$clean_meta = [];

		foreach ( $raw_meta as $key => $values ) {
			// WordPress stores meta as arrays even for single values, so we take the first
			$clean_meta[ $key ] = maybe_unserialize( $values[0] );
		}

		return $clean_meta;
	}

	public function get_post_meta() {
		return $this->post_meta;
	}

	public function display_conditions() {
		$display_conditions = new DisplayConditions( $this->post_meta, $this->current_post_id, $this->post_type, $this->popup_id );
		return $display_conditions::$is_popup_opened;
	}

	public function freequency_settings() {
		$freequency_settings = new FrequencySettings( $this->post_meta, $this->popup_id );
		return $freequency_settings::$is_frequency_matched;
	}

	public function ip_blocking() {
		$ip_blocking = new IPBlocking();
		$ip_blocking->block_ip($this->post_meta, $this->popup_id );
		return $ip_blocking::$is_ip_blocked;
	}

	public function geolocation_targeting() {
		return apply_filters( 'popup_builder_block/geolocation/targeting', true, $this->post_meta );
	}

	public function scheduling() {
		return apply_filters( 'popup_builder_block/scheduling', true, $this->post_meta );
	}

	public function cookie_targeting() {
		return apply_filters( 'popup_builder_block/cookie/targeting', true, $this->post_meta );
	}

	public function adblock_detection() {
		return apply_filters( 'popup_builder_block/adblock/detection', true, $this->post_meta );
	}

	public function abtest_active( array &$abtest_posts ) {
		$is_abtest_active = apply_filters( 'popup_builder_block/abtest/active', false, $this->post_meta );

		if($is_abtest_active) {
			if(!isset($abtest_posts[$this->post_meta['abTest']])) {
				$abtest_posts[$this->post_meta['abTest']] = [];
			}
			$abtest_posts[$this->post_meta['abTest']][] = $this->popup_id;
		}

		return $is_abtest_active;
	}

	public function operating_system_targeting() {
		return apply_filters( 'popup_builder_block/operatingsystem/targeting', true, $this->post_meta );
	}
	
	public function browser_targeting() {
		return apply_filters( 'popup_builder_block/browser/targeting', true, $this->post_meta );
	}

	public function referrer_targeting() {
		return apply_filters( 'popup_builder_block/referrer/targeting', true, $this->post_meta );
	}
}
