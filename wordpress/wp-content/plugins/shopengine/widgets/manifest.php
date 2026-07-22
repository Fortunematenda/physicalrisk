<?php

namespace ShopEngine\Widgets;

defined('ABSPATH') || exit;

use ShopEngine\Core\Register\Widget_List;
use ShopEngine\Widgets\Init\Enqueue_Scripts;
use ShopEngine\Widgets\Init\Route;


class Manifest{

	private $widget_list;

	public function init() {

		new Enqueue_Scripts();
		new Route();

		$this->manifest_widgets();

		add_action('elementor/elements/categories_registered', [$this, 'widget_categories']);
		add_action('elementor/widgets/register', [$this, 'register_widgets']);
        add_filter('elementor/editor/localize_settings', [$this, 'promote_pro_widgets'], 1000);
		add_filter('woocommerce_default_address_fields', function($fields) {
			foreach ($fields as $key => $value) {
				unset($fields[$key]['priority']);
			}
			return $fields;
		});
		

		// Check if the MP3 Music Player by Sonaar plugin is active
		if( ! function_exists('is_plugin_active') ){
			include_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		
		if(is_plugin_active('mp3-music-player-by-sonaar/sonaar-music.php') || is_plugin_active('smart-wishlist-for-more-convert/smart-wishlist-for-more-convert.php')){

			add_action('elementor/editor/init', [$this, 'category_initialize'], 0);

		}
		
	}

	public function category_initialize(){
		$elements_manager = \Elementor\Plugin::instance()->elements_manager;
		$this->widget_categories($elements_manager);
	}
	public function manifest_widgets() {

		foreach(Widget_List::instance()->get_list(true, 'active') as $widget) {

			if(isset($widget['path'])){

				if(file_exists($widget['path'] . '/' . $widget['slug'] . '-config.php')){
					require_once $widget['path'] . '/' . $widget['slug'] . '-config.php';
				}
			}
				
			if(class_exists($widget['config_class'])){
				$widget_config = new $widget['config_class']();

				if($widget_config->custom_inline_css() !== false){
					wp_add_inline_style( 'shopengine-elementor-style', $widget_config->custom_inline_css());
				}
		
				if($widget_config->custom_inline_js() !== false){
					wp_add_inline_script( 'shopengine-elementor-script', $widget_config->custom_inline_css());
				}
		
				if($widget_config->custom_init() !== false){
					add_action('init', [$widget_config, 'custom_init']);
				}
			}
		}
	}

	public function register_widgets() {

		foreach(Widget_List::instance()->get_list(true, 'active') as $widget) {

			if(isset($widget['path'])){

				if(file_exists($widget['path'] . '/' . $widget['slug'] . '.php')){
					require_once $widget['path'] . '/' . $widget['slug'] . '.php';
				}
			}

			if(isset($widget['base_class']) && class_exists($widget['base_class'])){

				\Elementor\Plugin::instance()->widgets_manager->register(new $widget['base_class']());
			}
		}
	}
	/**
	 * Promote Pro Widgets
	 * 
	 * @param $settings
	 * @return void
	 */
	public function promote_pro_widgets( $settings ) {
		if( 'shopengine-template' != get_post_type() || class_exists('\ShopEngine_Pro')) {
			return $settings;
		}
		
		if(isset($settings['promotionWidgets']) && is_array($settings['promotionWidgets'])) {
			$promotion_widgets = $settings['promotionWidgets'];
		} else {
			$promotion_widgets = [];
		}	
	
		$merged_shopengine_promotion_widgets = array_merge( $promotion_widgets, [
			[
				'name'       => 'account-dashboard',
				'title'      => esc_html__( 'Account Dashboard', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_dashboard',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'	 => 'account-address',
				'title' => esc_html__( 'Account Address', 'shopengine' ),
				'icon' => 'shopengine-widget-icon shopengine-icon-account_address',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'	   => 'account-details',
				'title'      => esc_html__( 'Account Details', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_form_register',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-downloads',
				'title'      => esc_html__( 'Account Downloads', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_downloads',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-form-login',
				'title'      => esc_html__( 'Account Form Login', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-checkout_form_login',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-form-register',
				'title'      => esc_html__( 'Account Form Register', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_form_register',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-logout',
				'title'      => esc_html__( 'Account Logout', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_logout',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-navigation',
				'title'      => esc_html__( 'Account Navigation', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_address',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-order-details',
				'title'      => esc_html__( 'Account Order Details', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-thankyou_order_details',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-orders',
				'title'      => esc_html__( 'Account Orders', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-orders_ac',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-wishlist',
				'title'      => esc_html__( 'Account Wishlist', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_wishlist',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-payment-methods',
				'title'      => esc_html__( 'Account Payment Methods', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_payment_methods',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'categories',
				'title'      => esc_html__( 'Categories', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-product_categories',
				'categories' => '["shopengine-general"]',
			],
			[
				'name'       => 'product-filters',
				'title'      => esc_html__( 'Product Filters', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-cross_sells',
				'categories' => '["shopengine-archive"]',
			],
			[
				'name'       => 'thankyou-address-details',
				'title'      => esc_html__( 'Thank You Address Details', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-thankyou_address_details',
				'categories' => '["shopengine-pro"]',
			],
			[
				'name'       => 'thankyou-order-confirm',
				'title'      => esc_html__( 'Thank You Order Confirm', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-thankyou_order_confirm',
				'categories' => '["shopengine-order"]',
			],
			[
				'name'       => 'thankyou-order-details',
				'title'      => esc_html__( 'Thank You Order Details', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-thankyou_order_details',
				'categories' => '["shopengine-order"]',
			],
			[
				'name'       => 'thankyou-thankyou',
				'title'      => esc_html__( 'Order Thank You', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-thankyou_message',
				'categories' => '["shopengine-order"]',
			],
			[
				'name'       => 'currency-switcher',
				'title'      => esc_html__( 'Currency Switcher', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-checkout_payment',
				'categories' => '["shopengine-general"]',
			],
			[
				'name'       => 'flash-sale-products',
				'title'      => esc_html__( 'Flash Sale Products', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-archive_products',
				'categories' => '["shopengine-general"]',
			],
			[
				'name'       => 'best-selling-product',
				'title'      => esc_html__( 'Best Selling Product', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-orders_ac',
				'categories' => '["shopengine-general"]',
			],
			[
				'name'       => 'comparison-button',
				'title'      => esc_html__( 'Comparison Button', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-product_compare_1',
				'categories' => '["shopengine-general"]',
			],
			[
				'name'       => 'product-size-charts',
				'title'      => esc_html__( 'Product Size Charts', 'shopengine' ),
				'icon'       => 'eicon-post-list shopengine-widget-icon',
				'categories' => '["shopengine-single"]',
			],
			[
				'name'       => 'vacation',
				'title'      => esc_html__( 'Vacation', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-thankyou_message',
				'categories' => '["shopengine-vacation"]',
			],
			[
				'name'       => 'advanced-coupon',
				'title'      => esc_html__( 'Advanced Coupon', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-checkout_coupon_form',
				'categories' => '["shopengine-general"]',
			],
			[
				'name'       => 'avatar',
				'title'      => esc_html__( 'Avatar', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-checkout_coupon_form',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'account-form-lost-password',
				'title'      => esc_html__( 'Lost Password', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-account_form_register',
				'categories' => '["shopengine-my_account"]',
			],
			[
				'name'       => 'checkout-order-pay',
				'title'      => esc_html__( 'Checkout Order Pay', 'shopengine' ),
				'icon'       => 'shopengine-widget-icon shopengine-icon-cross_sells',
				'categories' => '["shopengine-checkout"]',
			],
			[
				'name'       => 'product-carousel',
				'title'      => esc_html__( 'Product Carousel', 'shopengine' ),
				'icon'       => 'eicon-slider-push shopengine-widget-icon',
				'categories' => '["shopengine-general"]',
			]
		]);
		
		$settings['promotionWidgets'] = $merged_shopengine_promotion_widgets;
		
		return $settings;
	}
	public function widget_categories($elements_manager) {

		$elements_manager->add_category('shopengine-general', [
			'title' => esc_html__('ShopEngine General', 'shopengine'),
			'icon' => 'fa fa-plug',
		]);
		$elements_manager->add_category('shopengine-single', [
			'title' => esc_html__('ShopEngine Single Product', 'shopengine'),
			'icon' => 'fa fa-plug',
		]);
		$elements_manager->add_category('shopengine-cart', [
			'title' => esc_html__('ShopEngine Cart', 'shopengine'),
			'icon' => 'fa fa-plug',
		]);
		$elements_manager->add_category('shopengine-archive', [
			'title' => esc_html__('ShopEngine Product Archive', 'shopengine'),
			'icon' => 'fa fa-plug',
		]);
		$elements_manager->add_category('shopengine-checkout', [
			'title' => esc_html__('ShopEngine Checkout', 'shopengine'),
			'icon' => 'fa fa-plug',
		]);
		$elements_manager->add_category('shopengine-order', [
			'title' => esc_html__('ShopEngine Order', 'shopengine'),
			'icon' => 'fa fa-plug',
		]);
		$elements_manager->add_category('shopengine-my_account', [
			'title' => esc_html__('ShopEngine My Account', 'shopengine'),
			'icon' => 'fa fa-plug',
		]);
	}
}

