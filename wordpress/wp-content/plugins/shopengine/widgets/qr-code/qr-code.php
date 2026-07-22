<?php

namespace Elementor;

defined('ABSPATH') || exit;

class ShopEngine_Qr_Code extends \ShopEngine\Base\Widget
{

	public function config()
	{
		return new ShopEngine_Qr_Code_Config();
	}

	protected function register_controls()
	{

		$this->start_controls_section(
			'shopengine-qrcode-conent',
			[
				'label' => __('QR Code', 'shopengine'),
			]
		);

		$this->add_control(
			'shopengine_size',
			[
				'label' => __('Size', 'shopengine'),
				'type' => Controls_Manager::NUMBER,
				'min' => 0,
				'max' => 1000,
				'step' => 1,
				'default' => 150,
			]
		);

		$this->add_control(
			'shopengine_add_cart_url',
			[
				'label' => __('Scan to Add to Cart URL', 'shopengine'),
				'description' => __('If enabled, the QR code will generate a link that adds the product to the cart when scanned.', 'shopengine'),
				'type' => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default' => 'no',
			]
		);

		$this->add_control(
			'shopengine_direct_payment_url',
			[
				'label' => __('Scan to Direct Payment URL', 'shopengine'),
				'description' => __('If enabled, the QR code will generate a link that adds the product to cart and redirects directly to checkout.', 'shopengine'),
				'type' => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default' => 'no',
			]
		);

		$this->add_control(
			'shopengine_quantity',
			[
				'label'     => esc_html__('Quantity', 'shopengine'),
				'type'      => Controls_Manager::NUMBER,
				'min'       => 0,
				'max'       => 500,
				'step'      => 1,
				'default'   => 1,
				'conditions' => [
					'relation' => 'or',
					'terms'    => [
						[
							'name'     => 'shopengine_add_cart_url',
							'operator' => '===',
							'value'    => 'yes',
						],
						[
							'name'     => 'shopengine_direct_payment_url',
							'operator' => '===',
							'value'    => 'yes',
						],
					],
				],
			]
		);

		$this->add_responsive_control(
			'shopengine_code_align',
			[
				'label' => esc_html__('Alignment', 'shopengine'),
				'type' => Controls_Manager::CHOOSE,
				'options' => [
					'left' => [
						'title' => esc_html__('Left', 'shopengine'),
						'icon' => 'eicon-text-align-left',
					],
					'center' => [
						'title' => esc_html__('Center', 'shopengine'),
						'icon' => 'eicon-text-align-center',
					],
					'right' => [
						'title' => esc_html__('Right', 'shopengine'),
						'icon' => 'eicon-text-align-right',
					],
				],
				'selectors' => [
					'{{WRAPPER}} .shopengine-qrcode' => 'text-align: {{VALUE}};',
				],
				'separator' => 'before',
			]
		);

		$this->end_controls_section();
	}

	protected function screen()
	{

		$post_type = get_post_type();
		$product = \ShopEngine\Widgets\Products::instance()->get_product($post_type);
		$settings   = $this->get_settings_for_display();
		$product_id = $product->get_id();
		$quantity = ( !empty($settings['shopengine_quantity'] ) ? $settings['shopengine_quantity'] : 1 );

		if ($settings['shopengine_add_cart_url'] == 'yes') {

			$url = get_the_permalink( $product_id) . sprintf('?add-to-cart=%s&quantity=%s', $product_id, $quantity );

		} elseif ($settings['shopengine_direct_payment_url'] == 'yes') {

			$checkout_url = wc_get_checkout_url();
			$url = $checkout_url . sprintf('?add-to-cart=%s&quantity=%s', $product_id, $quantity );

		} else {

			$url = get_the_permalink( $product_id );
		}

		$title = get_the_title( $product_id );
		$product_url   = urlencode($url);
		$size    = ( !empty($settings['shopengine_size']) ? $settings['shopengine_size'] : 150 );
		$size = absint( $size );
		$dimension = esc_attr($size . 'x' . $size);
		$image_url = sprintf( 'https://api.qrserver.com/v1/create-qr-code/?size=%s&ecc=L&qzone=1&data=%s', $dimension, $product_url);

		?>
		<div class="shopengine-qrcode">
			<img src="<?php echo esc_url( $image_url ) ?>" alt="<?php echo esc_attr( $title ); ?>">
		</div>
	<?php
	}
}
