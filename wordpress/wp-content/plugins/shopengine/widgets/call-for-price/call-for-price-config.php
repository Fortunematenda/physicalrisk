<?php

namespace Elementor;

defined('ABSPATH') || exit;

class ShopEngine_Call_For_Price_Config extends \ShopEngine\Base\Widget_Config {


	public function get_name() {
		return 'call-for-price';
	}

	public function get_title() {
		return esc_html__('Call For Price', 'shopengine');
	}

	public function get_icon() {
		return 'shopengine-widget-icon shopengine-icon-call_for_price';
	}

	public function get_categories() {
		return ['shopengine-single'];
	}

	public function get_keywords() {
		return ['woocommerce', 'shop', 'store', 'price', 'call-for-price'];
	}

	public function get_template_territory() {
		return ['single', 'quick_view', 'quick_checkout'];
	}
}
