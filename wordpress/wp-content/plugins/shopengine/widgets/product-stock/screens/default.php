<?php

use ShopEngine\Utils\Helper;

 defined('ABSPATH') || exit;

$post_type = get_post_type();
$product = \ShopEngine\Widgets\Products::instance()->get_product($post_type);

$icon = '';
$stock_status = $product->get_stock_status();
$availability = $product->get_availability();

if($stock_status == 'instock') :

	$icon = isset($settings['shopengine_pstock_in_stock_icon']) ? $settings['shopengine_pstock_in_stock_icon'] : '';

elseif($stock_status == 'outofstock') :

	$icon = isset($settings['shopengine_pstock_out_of_stock_icon']) ? $settings['shopengine_pstock_out_of_stock_icon'] : '';

elseif($stock_status == 'onbackorder') :

	$icon = isset($settings['shopengine_pstock_available_on_backorder_icon']) ? $settings['shopengine_pstock_available_on_backorder_icon'] : '';

endif;

$default_icon_html = '';
if(!empty($icon)) {
	ob_start();
    \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']);
    $default_icon_html = ob_get_clean();
}
$default_stock_data = [
    'stock_status' => $stock_status,
    'availability' => $availability['availability'] ?? '',
    'class' => $availability['class'] ?? '',
    'icon' => $default_icon_html,
];

// Prepare variation data for variable products
$variation_data = [];
if ($product->is_type('variable')) {
    $variations = $product->get_available_variations();
    foreach ($variations as $variation) {
        $variation_product = wc_get_product($variation['variation_id']);
        $variation_stock_status = $variation_product->get_stock_status();
        $variation_icon = '';

        // Map variation stock status to icon
        if ($variation_stock_status == 'instock') {
            $variation_icon = isset($settings['shopengine_pstock_in_stock_icon']) ? $settings['shopengine_pstock_in_stock_icon'] : '';
        } elseif ($variation_stock_status == 'outofstock') {
            $variation_icon = isset($settings['shopengine_pstock_out_of_stock_icon']) ? $settings['shopengine_pstock_out_of_stock_icon'] : '';
        } elseif ($variation_stock_status == 'onbackorder') {
            $variation_icon = isset($settings['shopengine_pstock_available_on_backorder_icon']) ? $settings['shopengine_pstock_available_on_backorder_icon'] : '';
        }

        // Pre-render variation icon HTML
        $variation_icon_html = '';
        if (!empty($variation_icon)) {
            ob_start();
            \Elementor\Icons_Manager::render_icon($variation_icon, ['aria-hidden' => 'true']);
            $variation_icon_html = ob_get_clean();
        }

        $variation_data[$variation['variation_id']] = [
            'stock_status' => $variation_stock_status,
            'availability' => $variation_product->get_availability()['availability'] ?? '',
            'class' => $variation_product->get_availability()['class'] ?? '',
            'icon' => $variation_icon_html,
        ];
    }
}
?>

<div class="shopengine-product-stock" data-variations='<?php echo wp_json_encode($variation_data); ?>' data-default-stock='<?php echo wp_json_encode($default_stock_data); ?>'>

	<?php if($post_type == \ShopEngine\Core\Template_Cpt::TYPE) :

		$icons = [
			'in_stock_icon' => isset($settings['shopengine_pstock_in_stock_icon']) ? $this->_get_icon($settings['shopengine_pstock_in_stock_icon']) : '',
			'out_of_stock_icon' => isset($settings['shopengine_pstock_out_of_stock_icon']) ? $this->_get_icon($settings['shopengine_pstock_out_of_stock_icon']) : '',
			'available_on_backorder_icon' => isset($settings['shopengine_pstock_available_on_backorder_icon']) ? $this->_get_icon($settings['shopengine_pstock_available_on_backorder_icon']) : '',
		];

		$stock_type = $settings['shopengine_pstock_stock_type'];
		$stock_type = in_array($stock_type, array_keys($this->stock_types())) ? $stock_type : 'in_stock'; // Validate Stock Type.

		$stock_class = str_replace('_', '-', $stock_type);
		$stock_text = isset($settings[$stock_type . '_text']) ? $settings[$stock_type . '_text'] : Self::stock_types()[$stock_type];
		$stock_icon = isset($icons[$stock_type . '_icon']) ? $icons[$stock_type . '_icon'] : '';

		shopengine_content_render('<p class="stock ' . $stock_class . '" data-stock-status="' . esc_attr($stock_type) . '">' . $stock_icon . ' ' . $stock_text . '</p>');

	else : ?>
		<p class="stock <?php echo esc_attr(isset($availability['class']) ? $availability['class'] : ''); ?>" data-stock-status="<?php echo esc_attr($stock_status); ?>">

			<?php
			if(!empty($icon)) :
				\Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']);
			endif;

			if ( $product->is_on_backorder() ) {
				$stock_html =  !empty($availability['availability']) ? $availability['availability'] : esc_html__('On backorder', 'shopengine');
			} elseif ( $product->is_in_stock() ) {
				$stock_html = !empty($availability['availability']) ? $availability['availability'] : esc_html__('In Stock', 'shopengine');
			} else {
				$stock_html = !empty($availability['availability']) ? $availability['availability'] : esc_html__('Out of stock', 'shopengine');
			}
			
			$availability_html = $availability['availability'] ?? '';
			echo wp_kses(apply_filters( 'woocommerce_stock_html', $stock_html, $availability_html, $product ), Helper::get_kses_array());

			?>

		</p>

	<?php endif; ?>

</div>
