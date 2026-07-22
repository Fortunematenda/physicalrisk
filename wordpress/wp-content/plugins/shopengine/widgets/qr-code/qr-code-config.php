<?php

namespace Elementor;

defined('ABSPATH') || exit;

class ShopEngine_Qr_Code_Config extends \ShopEngine\Base\Widget_Config {

	public function get_name() {
		return 'qr-code';
	}

	public function get_title() {
		return esc_html__('QR Code', 'shopengine');
	}

	public function get_icon() {
		return 'shopengine-widget-icon shopengine-icon-qr_code';
	}

	public function get_categories() {
		return ['shopengine-single'];
	}

	public function get_keywords() {
		return ['woocommerce', 'shop', 'store', 'qr-code'];
	}

	public function get_template_territory() {
		return ['single', 'quick_view', 'quick_checkout'];
	}
}
