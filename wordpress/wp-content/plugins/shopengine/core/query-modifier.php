<?php

namespace ShopEngine\Core;

use ShopEngine\Traits\Singleton;
use ShopEngine\Core\Register\Widget_List;

class Query_Modifier
{

    use Singleton;

    private $custom_query = [];

    public function init()
    {

        add_action('pre_get_posts', [$this, 'modify_query']);
    }

    public function modify_query($query)
    {

        
        if (is_admin() || !$query->is_main_query() || $query->is_single === true) {
            return;
        }

        // Only proceed when it's the product query from widgets OR we're on the shop/product archive
        $is_product_query_flag = isset($query->query_vars['wc_query']) && $query->query_vars['wc_query'] == 'product_query';
        $is_shop_archive = ( function_exists('is_shop') && is_shop() ) || ( isset($query->query_vars['post_type']) && $query->query_vars['post_type'] === 'product' ) || ( isset($query->is_post_type_archive) && $query->is_post_type_archive === true );

        if ( ! $is_product_query_flag && ! $is_shop_archive ) {
            return;
        }

        // query filter begins

        // update query for product per page filter
        //phpcs:ignore WordPress.Security.NonceVerification.Recommended -- It's a fronted user part, not possible to verify nonce here
        if (!empty($_GET['shopengine_products_per_page'])) {
            //phpcs:ignore WordPress.Security.NonceVerification.Recommended
            $query->set('posts_per_page', absint(intval($_GET['shopengine_products_per_page'])));
        }

        // checking product filter widget active or not
        // but if `filter_pa_*` params are present on shop archive, allow processing even if widget not active
        $has_filter_params = false;
        if ( $is_shop_archive ) {
            foreach ( $_GET as $k => $v ) {
                if ( strpos( $k, 'filter_pa_' ) === 0 && ! empty( $v ) ) {
                    $taxonomy = substr( $k, strlen('filter_') ); // e.g. pa_color
                    $values = explode(',', trim( $v ));

                    $this->custom_query['relation'] = 'AND';
                    $this->custom_query[] = [
                        'taxonomy' => $taxonomy,
                        'field'    => 'slug',
                        'terms'    => $values,
                        'operator' => 'IN',
                    ];

                    $has_filter_params = true;
                }
            }
        }

        $active_widgets = Widget_List::instance()->get_list(true, 'active');
        if (!isset($active_widgets['product-filters']) && !$has_filter_params) {
            return;
        }

        $color_prefix = 'shopengine_filter_color_';

        $attribute_prefix = 'shopengine_filter_attribute_';

        $image_prefix = 'shopengine_filter_image_';

        $label_prefix = 'shopengine_filter_label_';

        $shipping_prefix = 'shopengine_filter_shipping_';

        $category_prefix = 'shopengine_filter_category';

        $stock_prefix = 'shopengine_filter_stock';

        $sale_prefix = 'shopengine_filter_onsale';

        $brand_prefix = 'shopengine_filter_brand';

        $meta_query = ['relation' => 'AND'];

        //phpcs:ignore WordPress.Security.NonceVerification.Recommended -- It's a fronted user part, not possible to verify nonce here
        foreach ($_GET as $key => $value) {

            if ($key === 'rating_filter') {
                $meta_query[] = [
                    'key' => '_wc_average_rating',
                    'value' => explode(',', trim($value)),
                    'type' => 'numeric',
                    'compare' => 'IN'
                ];
            }

            if ($key === $category_prefix) {

                $query->query['product_cat'] = '';
                $query->query_vars['product_cat'] = '';
                $query = $this->query($key . 'product_cat', $category_prefix, $value, $query);

            } elseif (strpos($key, $color_prefix) !== false) {

                $query = $this->query($key, $color_prefix, $value, $query);

            } elseif (strpos($key, $attribute_prefix) !== false) {

                $query = $this->query($key, $attribute_prefix, $value, $query);

            } elseif (strpos($key, $image_prefix) !== false) {

                $query = $this->query($key, $image_prefix, $value, $query);

            } elseif (strpos($key, $label_prefix) !== false) {

                $query = $this->query($key, $label_prefix, $value, $query);

            } elseif (strpos($key, $shipping_prefix) !== false) {

                $query = $this->query($key, $shipping_prefix, $value, $query);

            } elseif ($key === $brand_prefix) {

                $query = $this->query($key, $brand_prefix, $value, $query);

            } elseif ($key === $stock_prefix) {

                $meta_query[] = [
                    'key' => '_stock_status',
                    'value' => $value,
                    'compare' => 'IN'
                ];


            } elseif ($key === $sale_prefix) {

                $s = explode(',', $value);

                foreach ($s as $v) {

                    if ($v === 'on_sale') {

                        $product_ids_on_sale = wc_get_product_ids_on_sale(); // including varriation products
                        $query->set( 'post__in', (array) $product_ids_on_sale );

                    } else {
                        $meta_query[] = [
                            'key' => '_sale_price',
                            'compare' => 'NOT EXISTS',
                            'operator' => 'OR',
                        ];
                    }
                }
            }

            // Support custom attribute filtering (filter_custom_{slug})
            elseif (strpos($key, 'filter_custom_') === 0) {
                $attr_slug = substr($key, strlen('filter_custom_')); // e.g. material, brand
                $values = array_map('sanitize_text_field', explode(',', trim($value)));
                
                // Search in serialized _product_attributes meta for custom attributes
                foreach ($values as $val) {
                    $meta_query[] = [
                        'key' => '_product_attributes',
                        'value' => '"' . $val . '"',
                        'compare' => 'LIKE'
                    ];
                }
            }
        }

        if (!empty($meta_query)) {
            $query->set('meta_query', $meta_query);
        }

        $product_visibility_terms  = wc_get_product_visibility_term_ids();
        $product_visibility_not_in = array( $product_visibility_terms['exclude-from-catalog'] );

		if ( 'yes' === get_option( 'woocommerce_hide_out_of_stock_items' ) ) {
			$product_visibility_not_in[] = $product_visibility_terms['outofstock'];
		}
        $this->custom_query['tax_query'][] = apply_filters('shopengine-product-visibility-modifier',[
            'taxonomy'  => 'product_visibility',
            'terms'     =>  $product_visibility_not_in,
            'field'     => 'term_taxonomy_id',
            'operator'  => 'NOT IN',
        ]);

        $query->set('tax_query', apply_filters('shopengine-tax-query-modifier', $this->custom_query)); 
    }

    public function query($key, $prefix, $values, $query)
    {
        // Handle brand filter specifically
        if ($prefix === 'shopengine_filter_brand') {
            $taxonomy = 'product_brand';
        } else {
            $taxonomy = str_replace($prefix, '', $key);
        }
 
        $values = explode(',', trim($values));
 
        $this->custom_query['relation'] =  'AND';

        $this->custom_query[] = [
            'taxonomy' => $taxonomy,
            'field' => 'slug',
            'terms' => $values,
            'operator' => 'IN',
        ];

        return $query;
    }
}
