<?php $data_attr = apply_filters('shopengine/add_to_cart_widget/optional_tooltip_data_attr', ''); ?>

<div class='shopengine-swatches' <?php echo esc_attr($data_attr)?>>

	<?php

	$editor_mode = (\Elementor\Plugin::$instance->editor->is_edit_mode() || is_preview());

	if(get_post_type() == \ShopEngine\Core\Template_Cpt::TYPE) {

		if($product->get_stock_status() != 'instock') {

			echo esc_html__('To see the add to cart button , please set stock status as instock for - .', 'shopengine') . '"' . esc_html( $product->get_name() ) . '"';
		}
	}

	/*
		---------------------------------------------
		Add action for woocommerce quantity button
		--------------------------------------------
	*/

	if(!$product->is_sold_individually()) {

		$stock_quantity = $product->get_stock_quantity();

		if($stock_quantity != 1){

		    // plus minus button

			$btn_arg = [
				'plus_icon'  => $shopengine_quantity_plus_icon,
				'minus_icon' => $shopengine_quantity_minus_icon,
				'position'   => $shopengine_quantity_btn_position,
			];

			add_action('woocommerce_before_add_to_cart_quantity', function () use ($btn_arg) {

				echo wp_kses(sprintf('<div class="quantity-wrap %1$s">', $btn_arg['position']), \ShopEngine\Utils\Helper::get_kses_array());


				if($btn_arg['position'] === 'before') { ?>
					<div class="shopengine-qty-btn">
						<button type="button"
								class="plus"> <?php \Elementor\Icons_Manager::render_icon($btn_arg['plus_icon'], ['aria-hidden' => 'true']); ?> </button>
						<button type="button"
								class="minus"> <?php \Elementor\Icons_Manager::render_icon($btn_arg['minus_icon'], ['aria-hidden' => 'true']); ?> </button>
					</div>
					<?php
				}

				if($btn_arg['position'] === 'both') { ?>
					<button type="button"
							class="minus"> <?php \Elementor\Icons_Manager::render_icon($btn_arg['minus_icon'], ['aria-hidden' => 'true']); ?> </button>
					<?php
				}
			});

			add_action('woocommerce_after_add_to_cart_quantity', function () use ($btn_arg) {

				if($btn_arg['position'] === 'after') { ?>
					<div class="shopengine-qty-btn">
						<button type="button"
								class="plus"> <?php \Elementor\Icons_Manager::render_icon($btn_arg['plus_icon'], ['aria-hidden' => 'true']); ?> </button>
						<button type="button"
								class="minus"> <?php \Elementor\Icons_Manager::render_icon($btn_arg['minus_icon'], ['aria-hidden' => 'true']); ?> </button>
					</div>
					<?php
				}

				if($btn_arg['position'] === 'both') { ?>
					<button type="button"
							class="plus"> <?php \Elementor\Icons_Manager::render_icon($btn_arg['plus_icon'], ['aria-hidden' => 'true']); ?> </button>
					<?php
				}

				echo '</div>';
			});
		}
	}

	if($editor_mode) {

		global $wp_query, $post;;
		$main_query = clone $wp_query;
		$main_post = clone $post;

		$wp_query = new \WP_Query([]);
	}


	// Remove Auxin Shop template loader filter
	if (is_plugin_active('auxin-shop/auxin-shop.php')) {

		remove_filter('wc_get_template', 'auxshp_get_wc_template', 11, 2);

			// Remove Auxin Shop template loader filter
			global $wp_filter;
			if (isset($wp_filter['woocommerce_locate_template'])) {
				foreach ($wp_filter['woocommerce_locate_template']->callbacks as $priority => $callbacks) {
					foreach ($callbacks as $key => $callback) {
						if (is_array($callback['function']) && 
							is_object($callback['function'][0]) && 
							get_class($callback['function'][0]) === 'AUXSHP_Template_Loader' && 
							$callback['function'][1] === 'load_templates') {
							unset($wp_filter['woocommerce_locate_template']->callbacks[$priority][$key]);
						}
					}
				}
			}
	}

	// Get the current theme name
	$themeName = get_template();

	/*
		---------------------------------------------
		Remove Envo Shop JS if Envo Shop is active
		 This is to prevent conflicts with ShopEngine's single product template
		--------------------------------------------
	*/
	if($themeName == 'envo-shop') {

		// Stop Envo Shop from rendering its own duplicate plus/minus buttons
		remove_action('woocommerce_before_add_to_cart_quantity', 'envo_shop_display_quantity_minus');
		remove_action('woocommerce_after_add_to_cart_quantity', 'envo_shop_display_quantity_plus');
	}


	// Check if gift card plugin is active and enabled first
	$gift_card_plugin_active = function_exists('is_plugin_active') ? is_plugin_active('wt-woocommerce-gift-cards/wt-woocommerce-gift-cards.php') : false;
	$gift_card_class_exists = class_exists('Wt_Gc_Gift_Card_Purchase_Setup_Product_Page');
	$gift_card_support_enabled = !empty($shopengine_woocommerce_gift_card_support) && $shopengine_woocommerce_gift_card_support === 'yes';

	// Only proceed if gift card functionality is fully available
	if ($gift_card_plugin_active && $gift_card_class_exists && $gift_card_support_enabled) {
		$product_id = $product->get_id();
		$is_gift_card_product = metadata_exists( 'post', $product_id, '_wt_gc_gift_card_product' ) && get_post_meta( $product_id, '_wt_gc_gift_card_product', true );
		
		if ($is_gift_card_product) {
			$gift_card_setup = Wt_Gc_Gift_Card_Purchase_Setup_Product_Page::get_instance();
			
			// Check if templates are enabled for this product
			if (method_exists($gift_card_setup, 'is_templates_enabled') && $gift_card_setup::is_templates_enabled($product_id)) {
				// Use the complete gift card template design when support is enabled
				$gift_card_setup->shop_single_page_design();
			}
		} else {
			// For regular products when gift card plugin is active, use standard WooCommerce action
			do_action('woocommerce_' . $product->get_type() . '_add_to_cart');
		}
	} else {
		// When gift card plugin is not active, use standard WooCommerce action
		do_action('woocommerce_' . $product->get_type() . '_add_to_cart');
	}

	if($editor_mode) {
		$wp_query = $main_query;
		$post = $main_post;
		wp_reset_query();
		wp_reset_postdata();
	}

	?>

</div>
