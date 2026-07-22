<?php
defined('ABSPATH') || exit;
add_filter('woocommerce_product_tabs', function ($tabs) {

	if(isset($tabs['description'])) {
		$tabs['description']['callback'] = 'woocommerce_product_description_tab';
	}

	return $tabs;
}, 999);


\ShopEngine\Widgets\Widget_Helper::instance()->comment_template_filter_checker();


\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_filter_by_match('woocommerce/single-product/tabs/tabs.php', 'templates/single-product/tabs/tabs.php');

$product = \ShopEngine\Widgets\Products::instance()->get_product($post_type);

$product_tabs = apply_filters('woocommerce_product_tabs', []);

$in_editor_mode = \ShopEngine\Core\Template_Cpt::TYPE == get_post_type();

if($in_editor_mode) {

	global $product, $post;

	$main_post = clone $post;

	$product = \ShopEngine\Widgets\Products::instance()->get_product($post_type);
	$post = get_post($product->get_id());

	add_filter('the_content', [\ShopEngine\Widgets\Products::instance(), 'product_tab_content_preview']);

	$product_tabs = woocommerce_default_product_tabs();
}

// Remove Auxin Shop template loader filter

if ( is_plugin_active('auxin-shop/auxin-shop.php') ) {

	remove_filter('wc_get_template', 'auxshp_get_wc_template', 11, 2);
	remove_filter( 'woocommerce_product_review_comment_form_args', 'auxshp_modern_form_ouput', 10, 1 );

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

?>

    <div class="shopengine-product-tabs">
		<?php
		// Get widget settings
		$settings = isset($settings) ? $settings : [];
		$enable_attribute_links = isset($settings['shopengine_product_tabs_enable_attribute_links']) ? $settings['shopengine_product_tabs_enable_attribute_links'] : 'yes';
		$link_target = isset($settings['shopengine_product_tabs_attribute_link_target']) ? $settings['shopengine_product_tabs_attribute_link_target'] : '';

		// Add a temporary filter so attribute values link to the shop page with a filter query param
		$shop_attribute_link_filter = null;
		
		if ($enable_attribute_links === 'yes') {
			$shop_attribute_link_filter = function($html, $attribute, $values) use ($link_target) {
				if ( is_object($attribute) && method_exists($attribute, 'is_taxonomy') ) {
					$shop_url = '';
					if ( function_exists('wc_get_page_permalink') ) {
						$shop_url = wc_get_page_permalink('shop');
					}
					if ( empty($shop_url) ) {
						$shop_url = get_post_type_archive_link('product');
					}

					$linked = [];
					$target_attr = $link_target === '_blank' ? ' target="_blank" rel="noopener"' : '';
					
					if ( $attribute->is_taxonomy() ) {
						// Handle taxonomy attributes (pa_color, pa_size, etc)
						$taxonomy = $attribute->get_name(); // e.g. pa_color
						foreach ($values as $v) {
							if ( is_object($v) && isset($v->slug) ) {
								$term_slug = $v->slug;
								$term_name = $v->name;
							} else {
								$term_name = wp_strip_all_tags((string)$v);
								$term_slug = sanitize_title($term_name);
							}
							$param_name = 'filter_' . $taxonomy;
							$url = add_query_arg($param_name, $term_slug, $shop_url);
							$linked[] = sprintf('<a href="%s" rel="tag"%s>%s</a>', esc_url($url), $target_attr, esc_html($term_name));
						}
					} else {
						// Handle custom attributes (stored in postmeta)
						$attr_name = $attribute->get_name(); // e.g. 'Material', 'Brand'
						$slug = sanitize_title($attr_name);
						foreach ($values as $v) {
							$value_text = is_object($v) ? $v->name : wp_strip_all_tags((string)$v);
							$value_slug = sanitize_title($value_text);
							$param_name = 'filter_custom_' . $slug;
							$url = add_query_arg($param_name, $value_slug, $shop_url);
							$linked[] = sprintf('<a href="%s" rel="tag"%s>%s</a>', esc_url($url), $target_attr, esc_html($value_text));
						}
					}

					return wpautop(wptexturize(implode(', ', $linked)));
				}

				return $html;
			};

			add_filter('woocommerce_attribute', $shop_attribute_link_filter, 10, 3);
		}

		woocommerce_output_product_data_tabs();

		// Remove our temporary filter so it doesn't affect other outputs
		if ($shop_attribute_link_filter !== null) {
			remove_filter('woocommerce_attribute', $shop_attribute_link_filter, 10, 3);
		}
		?>
    </div>

<?php

if($in_editor_mode) {

	$post = $main_post;
}
