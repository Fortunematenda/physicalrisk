<?php defined('ABSPATH') || exit;

$editor_mode = (\Elementor\Plugin::$instance->editor->is_edit_mode() || is_preview());

if($editor_mode) {

	global $wp_query, $post;
	$main_query = clone $wp_query;
	$main_post = clone $post;

	$wp_query = new \WP_Query([]);
}

\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_filter();

\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_part_filter();

?>

<?php
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

?>

<?php 
	if ( is_plugin_active( 'iconic-woo-image-swap/iconic-woo-image-swap.php' ) )
	{
		global $iconic_woo_image_swap_class;
		remove_action('woocommerce_before_shop_loop_item',array($iconic_woo_image_swap_class,'template_loop_product_thumbnail'),5);
				
	}

	if (is_plugin_active('auxin-shop/auxin-shop.php')) {

		remove_action( 'woocommerce_after_shop_loop_item_title', 'auxshp_loop_product_meta', 12 );
		remove_action( 'woocommerce_after_shop_loop_item'      , 'auxshp_loop_product_tools', 12  );
		remove_action( 'woocommerce_archive_description'       , 'auxshp_archive_page_title_description', 1 );
		remove_action( 'woocommerce_before_shop_loop_item_title', 'auxshp_get_product_thumbnail', 11 );

		global $wp_filter;
		if (isset($wp_filter['woocommerce_after_single_product']) && 
			isset($wp_filter['woocommerce_after_single_product']->callbacks[20]) && 
			is_array($wp_filter['woocommerce_after_single_product']->callbacks[20])) {
			foreach ($wp_filter['woocommerce_after_single_product']->callbacks[20] as $key => $callback) {
				if (is_array($callback['function']) && 
					is_object($callback['function'][0]) && 
					get_class($callback['function'][0]) === 'AUXSHP_Template_Loader' && 
					$callback['function'][1] === 'auxshp_related_products') {
					unset($wp_filter['woocommerce_after_single_product']->callbacks[20][$key]);
				}
			}
		}
	}
?>

<?php 
	//blocksy theme conflict issue
     $themeName = get_template();
	if($themeName == 'blocksy'):?>
	 <?php remove_action( 'woocommerce_before_shop_loop_item_title', 'woocommerce_template_loop_product_thumbnail', 10 ); ?>
	<?php endif;
?>

<div class="shopengine-related <?php echo ($is_slider_enable ? 'slider-enabled' : 'slider-disabled'); ?>" data-controls="<?php echo esc_attr($encode_slider_options); ?>">
	
	<?php
	$relatedProduct = $args['related_products'];
	
	if(empty($relatedProduct)) {

		if( $shopengine_related_product_hide_if_products_not_found == 'yes' ) {
			return;
		} ?>

		<p style="font-size: 18px; font-weight:600"><?php echo esc_html__('No related products found.', 'shopengine'); ?></p>
		<?php
	} else{
		if( $shopengine_related_product_show_products_heading && $shopengine_related_product_show_products_heading == 'yes' ){ ?>
			<h2 class="shopengine-related-products-heading-title"><?php echo esc_html( $shopengine_related_product_show_products_heading_title ?? ''); ?></h2>
		<?php }
		woocommerce_related_products($args);
		if($is_slider_enable && $shopengine_related_product_slider_show_dots) {
			echo '<div class="swiper-pagination" style="width: 100%;"></div>';
		}
	
		if($is_slider_enable && $shopengine_related_product_slider_show_arrows) {
			shopengine_content_render(
				sprintf(
					'<div class="swiper-button-prev">%1$s</div><div class="swiper-button-next">%2$s</div>',
					$this->get_icon_html($shopengine_related_product_slider_left_arrow_icon),
					$this->get_icon_html($shopengine_related_product_slider_right_arrow_icon)
				)
			);
		}
	}

	

	
	?>
</div>

<?php

if($editor_mode) {
	global $wp_query, $post;

	$wp_query = $main_query;
	$post = $main_post;
	wp_reset_query();
	wp_reset_postdata();
}
