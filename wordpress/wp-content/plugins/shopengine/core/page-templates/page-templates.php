<?php

namespace ShopEngine\Core\PageTemplates;

defined('ABSPATH') || exit;

use ShopEngine\Traits\Singleton;
use ShopEngine\Widgets\Products;


class Page_Templates {
	use Singleton;

	private $templateList = [];
	private $listedCollected = false;

	public function init() {

		add_filter('elementor/document/urls/edit', function($url) {
			if(is_single()) {
				global $wp;
				$query   = $wp->query_vars;
				if(isset($query['name'])){
					$product = get_page_by_path( $query['name'], OBJECT, 'product' );
					if(!empty($product->ID)) {
						return $url . "&shopengine_product_id=" . $product->ID;
					}
				}
			}
			return $url;
		});

		$templates = $this->getTemplates();

		foreach($templates as $key => $template) {

			if(isset($template['class']) && $template['class']) {

				if ( class_exists( $template['class'] ) ) {
					new $template['class']();
				}

			}
		}
	}


	public function getTemplates() {

		if(!$this->listedCollected) {
			$this->templateList    = apply_filters('shopengine/page_templates', $this->get_list());
			$this->listedCollected = true;
		}

		return $this->templateList;
	}

	public function getTemplate($slug) {
		$page_templates = $this->getTemplates();

		return $page_templates[$slug] ?? [];
	}


	public function get_list() {

		$product_id = Products::instance()->get_preview_product();

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Some other templates call it without nonce added.
		if(isset($_GET['shopengine_product_id'])) {
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Some other templates call it without nonce added.
			$product_id = sanitize_text_field(wp_unslash($_GET['shopengine_product_id']));
			update_option('__shopengine_preview_product_id', $product_id);
		} elseif(get_option('__shopengine_preview_product_id')) {
			$product_id = get_option('__shopengine_preview_product_id');
		}

		$shop_url = get_permalink(wc_get_page_id('shop'));
		$shop_url = (strpos($shop_url, '?page_id') !== false ? get_home_url() . '?post_type=product' : $shop_url);

		return [
			'shop'     => [
				'title'   => esc_html__('Shop', 'shopengine'),
				'package' => 'free',
				'class'   => 'ShopEngine\Core\Page_Templates\Hooks\Shop',
				'opt_key' => 'shop',
				'css'     => 'shop',
				'url'     => $shop_url,
			],
			'archive'  => [
				'title'   => esc_html__('Archive', 'shopengine'),
				'package' => 'free',
				'class'   => 'ShopEngine\Core\Page_Templates\Hooks\Archive',
				'opt_key' => 'archive',
				'css'     => 'archive',
				'url'     => $shop_url,
			],
			'single'   => [
				'title'   => esc_html__('Single', 'shopengine'),
				'package' => 'free',
				'class'   => 'ShopEngine\Core\Page_Templates\Hooks\Single',
				'opt_key' => 'single',
				'css'     => 'single',
				'url'     => get_permalink($product_id),
			],
			'cart'     => [
				'title'   => esc_html__('Cart', 'shopengine'),
				'package' => 'free',
				'class'   => 'ShopEngine\Core\Page_Templates\Hooks\Cart',
				'opt_key' => 'cart',
				'css'     => 'cart',
				'url'     => get_permalink(wc_get_page_id('cart')),
			],
			'checkout' => [
				'title'   => esc_html__('Checkout', 'shopengine'),
				'package' => 'free',
				'class'   => 'ShopEngine\Core\Page_Templates\Hooks\Checkout',
				'opt_key' => 'checkout',
				'css'     => 'checkout',
				'url'     => get_permalink(wc_get_page_id('checkout')),
			],
			'order'            => [
				'title'   => esc_html__('Order / Thank you', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Thank_You',
				'opt_key' => 'order',
				'css'     => 'order',
				'url'	  => get_permalink( wc_get_page_id( 'checkout' ) )
			],
			'my_account_login' => [
				'title'   => esc_html__('My Account Login / Register', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Login',
				'opt_key' => 'my_account_login',
				'css'     => 'account-login-register',
			],
			'my_account'       => [
				'title'   => esc_html__('Account Dashboard', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account',
				'opt_key' => 'my_account',
				'css'     => 'account',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'account_orders'       => [
				'title'   => esc_html__('My Account Orders', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Orders',
				'opt_key' => 'account_orders',
				'css'     => 'account-orders',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'account_wishlist'       => [
				'title'   => esc_html__('My Account Wishlist', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Wishlist',
				'opt_key' => 'account_wishlist',
				'css'     => 'account-wishlist',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'account_payment_methods'       => [
				'title'   => esc_html__('My Account Payment Methods', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Payment_Methods',
				'opt_key' => 'account_payment_methods',
				'css'     => 'account-payment-methods',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'account_downloads'    => [
				'title'   => esc_html__('My Account Downloads', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Downloads',
				'opt_key' => 'account_downloads',
				'css'     => 'account-downloads',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'account_orders_view'  => [
				'title'   => esc_html__('My Account Order Details', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Orders_View',
				'opt_key' => 'account_orders_view',
				'css'     => 'account-orders-view',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'account_edit_account' => [
				'title'   => esc_html__('My Account Details', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Details',
				'opt_key' => 'account_edit_account',
				'css'     => 'account-details',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'account_edit_address' => [
				'title'   => esc_html__('My Account Address', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Account_Address',
				'opt_key' => 'account_edit_address',
				'css'     => 'account-address',
				'url'	  => get_permalink( wc_get_page_id( 'myaccount' ) )
			],
			'lost-password'     => [
				'title'   => esc_html__('Reset Password Form', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Lost_Password',
				'opt_key' => 'lost-password',
				'css'     => 'lost-password',
				'url'     => get_permalink(wc_get_page_id('myaccount')),
			],
			'reset-password'     => [
				'title'   => esc_html__('New Password Form', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Reset_Password',
				'opt_key' => 'reset-password',
				'css'     => 'reset-password',
				'url'     => get_permalink(wc_get_page_id('myaccount')),
			],
			'empty-cart'     => [
				'title'   => esc_html__('Empty Cart', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Empty_Cart',
				'opt_key' => 'empty-cart',
				'css'     => 'empty-cart',
				'url'     => get_permalink(wc_get_page_id('cart')),
			],
			'checkout-order-pay' => [
				'title'   => esc_html__('Checkout Order Pay', 'shopengine'),
				'package' => 'pro',
				'class'   => 'ShopEngine_Pro\Templates\Hooks\Checkout_Order_Pay',
				'opt_key' => 'checkout-order-pay',
				'css'     => 'checkout-order-pay',
				'url'     => get_permalink(wc_get_page_id('checkout')). '/order-pay',
			]
		];


	}
}
