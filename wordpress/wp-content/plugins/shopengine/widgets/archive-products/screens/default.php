<?php
/**
 * This template will overwrite the WooCommerce file: woocommerce/archive-product.php.
 */
defined('ABSPATH') || exit;
\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_part_filter_by_match('woocommerce/content-product.php', 'templates/content-product.php');
\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_filter();
\ShopEngine\Compatibility\Conflicts\Theme_Hooks::instance()->theme_conflicts__archive_products_widget_during_render();

// Extract settings passed from screen method
extract($settings_to_pass);
$wrap_extra_class = sprintf('%1$s%2$s', 'shopengine-grid', ($shopengine_is_hover_details !== 'yes' && $shopengine_group_btns !== 'yes') ? ' shopengine-hover-disable' : '');

$editor_mode = ( \Elementor\Plugin::$instance->editor->is_edit_mode() || is_preview() ) ;

?>
<?php 
	if ( is_plugin_active( 'iconic-woo-image-swap/iconic-woo-image-swap.php' ) )
	{
		global $iconic_woo_image_swap_class;
		remove_action('woocommerce_before_shop_loop_item',array($iconic_woo_image_swap_class,'template_loop_product_thumbnail'),5);
				
	}
?>
	

<?php 

	if ( is_plugin_active('auxin-elements/auxin-elements.php') ) {

		remove_action( 'woocommerce_shop_loop_item_title', 'auxin_woocommerce_template_loop_product_title', 10 );
	}

	if(is_plugin_active('auxin-shop/auxin-shop.php')) {

		remove_action( 'woocommerce_after_shop_loop_item_title', 'auxshp_loop_product_meta', 12 );
		remove_action( 'woocommerce_after_shop_loop_item'      , 'auxshp_loop_product_tools', 12  );
		remove_action( 'woocommerce_archive_description'       , 'auxshp_archive_page_title_description', 1 );
		remove_action( 'woocommerce_before_shop_loop_item_title', 'auxshp_get_product_thumbnail', 11 );
	}
?>
	 
<?php
	//Blocksy theme conflict issue 
     $themeName = get_template();
	if($themeName == 'blocksy'):?>
	 <?php remove_action( 'woocommerce_before_shop_loop_item_title', 'woocommerce_template_loop_product_thumbnail', 10 ); ?>
	 <?php remove_action('woocommerce_before_shop_loop_item_title', 'woocommerce_template_loop_rating', 20); ?>
	<?php endif;
?>

<?php
	//Eduma theme conflict 
    $themeName = get_template();
	if($themeName == 'eduma'):?>
	 <?php remove_filter('loop_shop_columns', '__return_false'); ?>
	<?php endif;
?>
	<?php

	if(!function_exists('custom_shopengine_product_title')) {        
		function custom_shopengine_product_title($header_size, $settings) {
			global $product;

				$title = get_the_title($product->get_id());
				
				// Handle word limit if excerpt is enabled
				if (isset($settings['shopengine_title_excerpt_enable']) && 
					$settings['shopengine_title_excerpt_enable'] === 'yes' && 
					isset($settings['shopengine_title_excerpt_length'])) {
					$word_limit = (int) $settings['shopengine_title_excerpt_length'];
					$title = wp_trim_words($title, $word_limit, '...');
				}
				
				shopengine_content_render(
					sprintf(
						'<%1$s class="woocommerce-loop-product__title">%2$s</%1$s>',
						esc_attr($header_size),
						esc_html($title)
					)
				);
		}
	}

	// Remove the default WooCommerce title hook and add the custom title function
	remove_action('woocommerce_shop_loop_item_title', 'woocommerce_template_loop_product_title', 10);
	add_action('woocommerce_shop_loop_item_title', function() use ($settings_to_pass) {
		$header_size = isset($settings_to_pass['shopengine_archive_product_title_header_size']) ? $settings_to_pass['shopengine_archive_product_title_header_size'] : 'h1';
		if (function_exists('custom_shopengine_product_title')) {
			custom_shopengine_product_title($header_size, $settings_to_pass);
		}
	}, 10);

	?>
<div data-pagination="<?php echo esc_attr($shopengine_pagination_style) ?>"
	     class="shopengine-archive-products <?php echo esc_attr($wrap_extra_class); ?> <?php echo (isset($shopengine_independent_add_to_cart) && $shopengine_independent_add_to_cart === 'yes' && isset($shopengine_independent_add_to_cart_position) && $shopengine_independent_add_to_cart_position === 'top') ? 'shopengine-independent-add-to-cart-position-top' : ''; ?>">
	<?php
	// add product description
	add_action('woocommerce_after_shop_loop_item_title', function () use ($shopengine_is_details, $shopengine_group_btns, $shopengine_independent_add_to_cart, $shopengine_independent_add_to_cart_position, $shopengine_is_hover_details) {
		$has_group_buttons    = ($shopengine_group_btns === 'yes');
		$has_independent      = (isset($shopengine_independent_add_to_cart) && $shopengine_independent_add_to_cart === 'yes');
		$show_indep_bottom    = $has_independent && isset($shopengine_independent_add_to_cart_position) && $shopengine_independent_add_to_cart_position === 'bottom';
		$show_default_buttons = !$has_group_buttons && !$has_independent;
		$show_description     = ($shopengine_is_details === 'yes') && $show_default_buttons;
		$show_footer          = $show_description || $show_indep_bottom || $show_default_buttons;

		$footer_classes = 'shopengine-product-description-footer';
		if ($shopengine_is_hover_details === 'yes') {
			$footer_classes .= ' shopengine-product-description-footer-hover';
		}
		if ($has_independent) {
			$footer_classes .= ' shopengine-independent-add-to-cart';
		}

		if ($show_footer) : ?>
				<div class="<?php echo esc_attr($footer_classes); ?>">
			<?php endif;

			if ($show_description) : ?>
				<div class="shopengine-product-excerpt"> <?php the_excerpt(); ?> </div>
			<?php endif;

			if ($show_indep_bottom) : ?>
				<div class="shopengine-product-description-btn-group shopengine-independent-add-to-cart shopengine-cart-only">
					<?php woocommerce_template_loop_add_to_cart(); ?>
				</div>
			<?php elseif ($show_default_buttons) : ?>
				<div class="shopengine-product-description-btn-group default-btns <?php echo esc_attr($this->get_button_hide_classes()); ?>">
					<?php $this->render_footer_action_btns(); ?>
				</div>
			<?php endif;

			if ($show_footer) : ?>
				</div>
			<?php endif;

	}, 40);

	// If independent position is 'top', render add-to-cart in the image area (before title)
	if (isset($shopengine_independent_add_to_cart) && $shopengine_independent_add_to_cart === 'yes') {
		add_action('woocommerce_before_shop_loop_item_title', function () use ($shopengine_independent_add_to_cart, $shopengine_independent_add_to_cart_position, $shopengine_group_btns) {
			if (isset($shopengine_independent_add_to_cart_position) && $shopengine_independent_add_to_cart_position === 'top') :
				woocommerce_template_loop_product_link_close();
				?>
				<div class="shopengine-product-thumb-add-to-cart shopengine-independent-add-to-cart shopengine-cart-only">
				<?php woocommerce_template_loop_add_to_cart(); ?>
				</div>
				<?php
				woocommerce_template_loop_product_link_open();
			endif;
		}, 20);
	}

	// Editor mode product query args for pagination and product count based on customizer settings. On frontend, it will use the default query.

	if ( $editor_mode ) {
		$per_page = (int) get_option('posts_per_page');
		$paged = max(1, (int) get_query_var('paged'), (int) get_query_var('page'));
		$wp_query_args = [
			'post_type'      => 'product',
			'posts_per_page' => $per_page,
			'paged'          => $paged,
			'post_status'    => 'publish',
			'tax_query'      => [
				[
					'taxonomy' => 'product_visibility',
					'field'    => 'name',
					'terms'    => ['exclude-from-catalog'],
					'operator' => 'NOT IN',
				],
			],
		];
	} else {
		$wp_query_args = ['post_type' => 'product'];
	}

	// pagination next previous button label filter

	if($shopengine_pagination_style === 'numeric') {
		$control_args['prev_icon'] = '<i class="' . esc_attr($shopengine_pagination_prev_icon['value']) . '"></i>';
		$control_args['next_icon'] = '<i class="' . esc_attr($shopengine_pagination_next_icon['value']) . '"></i>';
	}

	if($shopengine_pagination_style === 'default') {
		$control_args['prev_icon'] = $shopengine_pagination_prev_text;
		$control_args['next_icon'] = $shopengine_pagination_next_text;
	}

	if($shopengine_pagination_style === 'load-more' || $shopengine_pagination_style === 'load-more-on-scroll') {
		$control_args['prev_icon'] = '';
		$control_args['next_icon'] = $shopengine_pagination_loadmore_text;
	}

	if(isset($control_args)) {
		add_filter('woocommerce_pagination_args', function ($args) use ($control_args) {
			$args['prev_text'] = $control_args['prev_icon'];
			$args['next_text'] = $control_args['next_icon'];

			return $args;
		});
	}

	$page_type = \ShopEngine\Widgets\Products::instance()->get_template_type_by_id(get_the_ID());
	if(in_array($page_type, ['archive', 'shop', 'search']) &&  $editor_mode) {

		global $wp_query, $post;
		$main_query = clone $wp_query;
		$main_post = clone $post;
		$wp_query = new \WP_Query($wp_query_args);
		wc_setup_loop(
			[
				'is_filtered'  => is_filtered(),
				'total'        => $wp_query->found_posts,
				'total_pages'  => $wp_query->max_num_pages,
				'per_page'     => $wp_query->get('posts_per_page'),
				'current_page' => max(1, $wp_query->get('paged', 1)),
			]
		);
	}

	$run_loop = $editor_mode ? true : (is_shop() || is_archive() ? woocommerce_product_loop() : false);
	if( $editor_mode ) {

		if(empty(WC()->session)) {
			WC()->session = new WC_Session_Handler();
			WC()->session->init();
		}
	}

	//this option will come from Customizer > Woocmmerce > Product catelog > Products per row in mobile
	$custom_catalog_option = get_theme_mod('shopengine_product_per_page_mobile', '2');
	$custom_catalog_option_tablet = get_theme_mod('shopengine_product_per_page_tablet', '2');

	$style = "
		:root{
			--shopengine-product-row-mobile : $custom_catalog_option;
			--shopengine-product-row-tablet : $custom_catalog_option_tablet;
		}
	    ";

	if ($columns = get_option('woocommerce_catalog_columns')) {
		$style = "
		:root{
		--wc-product-column : $columns;
		--shopengine-product-row-mobile : $custom_catalog_option;
		--shopengine-product-row-tablet : $custom_catalog_option_tablet;
		}
	    ";
	}
	shopengine_content_render("<style>$style</style>");


	if(wc_is_active_theme('kadence')):?>
	   <div class="product-details"> </div>
	<?php endif;

	$tooltip = !empty($settings['shopengine_is_tooltip']) ? $settings['shopengine_is_tooltip'] : '';
	if($run_loop) {

		do_action('woocommerce_before_shop_loop');

		woocommerce_product_loop_start();

		if(wc_get_loop_prop('total')) {
			while(have_posts()) {
				the_post();

				/**
				 * Hook: woocommerce_shop_loop.
				 */
				do_action('woocommerce_shop_loop');

				global $product;

				// Ensure visibility.
				if ( ! empty( $product ) &&  $product->is_visible() ) : ?>
				
					<li class="archive-product-container" data-tooltip="<?php echo esc_attr($tooltip); ?>">
						<ul class="shopengine-archive-mode-grid">
							<li class="shopengine-archive-products__left-image" >
								<a title="<?php esc_html_e('Archive Product Left Image','shopengine')?>" href="<?php echo esc_url( get_the_permalink() ); ?>">
								<?php shopengine_content_render( woocommerce_get_product_thumbnail( get_the_id() ) )?>
								</a>
							</li>

							<?php wc_get_template_part('content', 'product');?>

						</ul>
					</li>
				<?php endif;
			}
		}

		woocommerce_product_loop_end();

		/**
		 * Hook: woocommerce_after_shop_loop.
		 *
		 * @hooked woocommerce_pagination - 10
		 */
		do_action('woocommerce_after_shop_loop');

	} else {
		/**
		 * Hook: woocommerce_no_products_found.
		 *
		 * @hooked wc_no_products_found - 10
		 */
		do_action('woocommerce_no_products_found');
	}

	if(in_array($page_type, ['archive', 'shop', 'search']) && $editor_mode) {
		$wp_query = $main_query;
		$post = $main_post;
		wp_reset_query();
		wp_reset_postdata();
	}
	?>
</div>
