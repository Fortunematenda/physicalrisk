<?php defined('ABSPATH') || exit;

\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_filter();

\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_part_filter_by_match('woocommerce/content-product.php', 'templates/content-product.php');

$upsell_ids = $product->get_upsell_ids();

$upsells = array_filter(array_map('wc_get_product', $upsell_ids), 'wc_products_array_filter_visible');

$editor_mode = (\Elementor\Plugin::$instance->editor->is_edit_mode() || is_preview());

if($editor_mode) {

	global $wp_query, $post;;
	$main_query = clone $wp_query;
	$main_post = clone $post;

	$wp_query = new \WP_Query([]);

	$args = [
		'type'  => ['simple'],
		'limit' => $shopengine_up_sells_product_to_show,
	];

	$upsells = wc_get_products($args);

	unset($args, $upsell_ids);
}

// woostify theme compatibility
$theme_name = get_template();
if ($theme_name == 'woostify') {
	
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_wrapper_open', 10 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_print_out_of_stock_label', 15 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_image_wrapper_open', 20 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_change_sale_flash', 23 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_product_loop_item_action', 25 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_link_open', 30 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_hover_image', 40 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_image', 50 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_link_close', 60 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_add_to_cart_on_image', 70 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_product_loop_item_wishlist_icon_bottom', 80 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_image_wrapper_close', 90 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'woostify_loop_product_content_open', 100 );

	remove_action( 'woocommerce_shop_loop_item_title', 'woostify_add_template_loop_product_category', 5 );
	remove_action( 'woocommerce_shop_loop_item_title', 'woostify_add_template_loop_product_title', 10 );

	remove_action( 'woocommerce_after_shop_loop_item_title', 'woostify_loop_product_rating', 2 );
	remove_action( 'woocommerce_after_shop_loop_item_title', 'woostify_loop_product_meta_open', 5 );
	remove_action( 'woocommerce_after_shop_loop_item_title', 'woostify_loop_product_price', 10 );

	remove_action( 'woocommerce_after_shop_loop_item', 'woostify_loop_product_add_to_cart_button', 10 );
	remove_action( 'woocommerce_after_shop_loop_item', 'woostify_loop_product_meta_close', 20 );
	remove_action( 'woocommerce_after_shop_loop_item', 'woostify_loop_product_content_close', 50 );
	remove_action( 'woocommerce_after_shop_loop_item', 'woostify_loop_product_wrapper_close', 100 );

} 

if (is_plugin_active('auxin-shop/auxin-shop.php')) {

	remove_action( 'woocommerce_after_shop_loop_item_title', 'auxshp_loop_product_meta', 12 );
	remove_action( 'woocommerce_after_shop_loop_item'      , 'auxshp_loop_product_tools', 12  );
	remove_action( 'woocommerce_archive_description'       , 'auxshp_archive_page_title_description', 1 );
	remove_action( 'woocommerce_before_shop_loop_item_title', 'auxshp_get_product_thumbnail', 11 );
}

if(empty($upsells)) {

	return;
}

$is_slider_enable = ($shopengine_up_sells_product_enable_slider == "yes") ? true : false;
$init_slider = ($shopengine_up_sells_product_to_show > $shopengine_up_sells_product_slider_perview) && (count($upsells) > $shopengine_up_sells_product_slider_perview) ;


$shopengine_up_sells_product_column_gap = $this->get_settings_for_display('shopengine_up_sells_product_column_gap');
$shopengine_up_sells_product_column_gap = isset($shopengine_up_sells_product_column_gap['size']) ? $shopengine_up_sells_product_column_gap : ['size' => 10];

// slider controls for the template file
$slider_options = [
	'slider_enabled'        => $is_slider_enable,
	'slides_to_show'		=> $shopengine_up_sells_product_slider_perview,
	'slider_loop'           => ($init_slider && $shopengine_up_sells_product_slider_loop === "yes") ? true : false,
	'slider_autoplay'       => ($shopengine_up_sells_product_slider_autoplay === "yes") ? true : false,
	'slider_autoplay_delay' => $shopengine_up_sells_product_slider_autoplay_delay,
	'slider_space_between'  => $shopengine_up_sells_product_column_gap['size'],
];

$columns	= $is_slider_enable ? $shopengine_up_sells_product_slider_perview : $shopengine_up_sells_product_column_gap['size'];

?>

<div class="shopengine-up-sells <?php echo ($is_slider_enable ? 'slider-enabled' : 'slider-disabled'); ?>" data-controls="<?php echo esc_attr(json_encode($slider_options)); ?>">
	
	<?php if( isset($shopengine_up_sells_product_show_products_heading) && $shopengine_up_sells_product_show_products_heading == 'yes' ) : ?>
		<h2 class="shopengine-up-sells-products-heading"><?php echo esc_html($shopengine_up_sells_product_show_products_heading_title ?? ''); ?></h2>
	<?php endif; ?>

	<?php
	if($post_type == \ShopEngine\Core\Template_Cpt::TYPE) {
		wc_get_template(
			'single-product/up-sells.php',
			[
				'upsells'        => $upsells,
				'posts_per_page' => $shopengine_up_sells_product_to_show,
				'orderby'        => $shopengine_up_sells_product_orderby,
				'columns'        => $columns,
			]
		);
	} else {
		woocommerce_upsell_display($shopengine_up_sells_product_to_show, $columns, $shopengine_up_sells_product_orderby, $shopengine_up_sells_product_order);
	}

	if($init_slider && $is_slider_enable && $shopengine_up_sells_product_slider_show_dots) {
		echo '<div class="swiper-pagination" style="width: 100%;"></div>';
	}

	if($init_slider && $is_slider_enable && $shopengine_up_sells_product_slider_show_arrows) {
		shopengine_content_render(
			sprintf(
				'<div class="swiper-button-prev">%1$s</div><div class="swiper-button-next">%2$s</div>',
				$this->get_icon_html($shopengine_up_sells_product_slider_left_arrow_icon),
				$this->get_icon_html($shopengine_up_sells_product_slider_right_arrow_icon)
			)
		);
	}
	?>
</div>

<?php

if($editor_mode) {

	global $wp_query, $post;;

	$wp_query = $main_query;
	$post = $main_post;
	wp_reset_query();
	wp_reset_postdata();

	unset($main_query, $main_post);
}
