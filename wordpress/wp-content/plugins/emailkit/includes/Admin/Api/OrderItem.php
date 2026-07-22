<?php 

namespace EmailKit\Admin\Api;

defined( 'ABSPATH' ) || exit;

class OrderItem {
	
	public $prefix = '';
	public $param = '';
	public $request = null;

	public function __construct() {
		
		add_action('rest_api_init', function () {
            register_rest_route('emailkit/v1', 'last-order-item', array(
                'methods' => \WP_REST_Server::ALLMETHODS,
                'callback' => [$this, 'get_last_order_item'],
                'permission_callback' => '__return_true',
            ));
        });
	}

	public function get_last_order_item($request)
    {

		if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
			return [
				'status'    => 'fail',
				'message'   => [ __( 'Nonce mismatch.', 'emailkit' )]
			];
		}

		if (!is_user_logged_in() || !current_user_can('manage_options')) {
			return [
				'status'    => 'fail',
				'message'   => [ __( 'Access denied.', 'emailkit' ) ]
			];
		}

        if(!function_exists('is_plugin_active')){
           // Include necessary WordPress files
           require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
		 
        if(!is_plugin_active('woocommerce/woocommerce.php')){
            return [
                'status' => 'fail',
                'message' => __( 'No processing orders found or no items in the last order.', 'emailkit' ),
            ];  
        }

        $last_order = wc_get_orders(array(
            'limit' => 1,
            'orderby' => 'date',
            'order' => 'DESC',
            'status' => array_keys( wc_get_order_statuses()),
        ));
        
        if (!empty($last_order)) {
            $last_order_id = reset($last_order)->get_id();
            $order = wc_get_order($last_order_id);
            $items = $order->get_items();
            $products_data = [];
            if (!empty($items)) {
                foreach ($items as $item_id => $item) {
                    $product = $item->get_product();
                    $product_name = $item->get_name();
                    $item_qty = $item->get_quantity();
                    $item_total = $item->get_total();
                    $product_id = $item->get_product_id();
                    $variation_id = $item->get_variation_id();
                    $product_sku = $product->get_sku();
                    $product_price = $product->get_price() * $item_qty;
            
                    // Fetch product image URL
                    $product_image_id = $product->get_image_id();
                    $product_image_url = wp_get_attachment_url($product_image_id);
            
                    if (!$product_image_url) {
                        $product_image_url = wc_placeholder_img_src();
                    }

                    // Get purchase note
                    $purchase_note = $product->get_purchase_note();
                    $purchase_note = !empty($purchase_note) ? wp_kses_post($purchase_note) : '';

                    $attributes = [];
                    $meta_data = $item->get_meta_data();

                    foreach ($meta_data as $meta) {
                        // Check for product attribute (pa_ is the prefix for standard attributes)
                        if (strpos($meta->key, 'pa_') === 0) {
                            // Standard product attribute
                            $formatted_name = ucwords(wc_attribute_label(str_replace('pa_', '', $meta->key), $product));
					        $formatted_value = is_string($meta->value) ? ucwords(strtolower($meta->value)) : ''; // Capitalize the value

                            // Add the attribute to the list with HTML markup
                            $attributes[] = esc_html($formatted_name) . ': ' . esc_html($formatted_value);

                        } else {
                            
                            $formatted_name = is_string($meta->key) ? ucwords(str_replace('_', ' ', strtolower($meta->key))) : '';
					        $formatted_value = is_string($meta->value) ? ucwords(strtolower($meta->value)) : '';  

                            // Add the custom meta to the list with HTML markup
                            $attributes[] = esc_html($formatted_name) . ':' . esc_html($formatted_value);

                        }
                    }

                    $product_attributes = !empty($attributes) ? implode(', ', $attributes) : '';

                    
                }
        
                $billing_name = $order->get_formatted_billing_full_name();
                $status = $order->get_status();
                
                 
                $shipping_first_name = $order->get_shipping_first_name();
                $shipping_last_name = $order->get_shipping_last_name();
                $shipping_full_name = $shipping_first_name . ' ' . $shipping_last_name;


                $billing_country_code = $order->get_billing_country();
                $billing_country_full_name = WC()->countries->countries[ $billing_country_code ];
                $billing_state_code = $order->get_billing_state();
                $billing_states = WC()->countries->get_states($billing_country_code);

                $billing_state_full_name = is_array($billing_states) && isset($billing_states[$billing_state_code]) ? $billing_states[$billing_state_code] : $billing_state_code;
                $shipping_country_code = $order->get_shipping_country();
                $shipping_country_full_name = (!empty($shipping_country_code) && isset(WC()->countries->countries[$shipping_country_code]))
                ? WC()->countries->countries[$shipping_country_code]
                : '';

                $shipping_states = WC()->countries->get_states($shipping_country_code);
                $shipping_state_code = $order->get_shipping_state();
                
                $shipping_full_state_name = is_array($shipping_states) && isset($shipping_states[$shipping_state_code]) ? $shipping_states[$shipping_state_code] : $shipping_state_code;

                $order_date = $order->get_date_created()->format('Y-m-d H:i:s');

                // Convert the order date to the site's local timezone
                $localized_date = get_date_from_gmt($order_date);

                // Get the site's date and time formats
                $date_format = get_option('date_format');
                $time_format = get_option('time_format');

                // Format the date and time separately
                $formatted_date = date_i18n($date_format, strtotime($localized_date));
                $formatted_time = date_i18n($time_format, strtotime($localized_date));

                $item_data = [
                    'order_id' => $last_order_id,
                    'billing_name' => $billing_name,
                    'status' => $status,
                    "order_number" => $order->get_order_number(),
                    "order_fully_refunded" =>  wc_price($order->get_total_refunded()),
                    'partial_refund_amount' => '-'.wc_price($order->get_total() - $order->get_total_refunded()),
                    "order_currency" => $order->get_currency(),
                    "billing_phone" => $order->get_billing_phone(),
                    "shipping_total" => wc_price($order->get_shipping_total()),
                    "order_subtotal" => wc_price($order->get_subtotal()),
                    "shipping_tax_total" => wc_format_decimal($order->get_shipping_tax(), 2),
                    "order_date" => $formatted_date,
                    'order_time' => $formatted_time,
                    "shipping_method" => $order->get_shipping_method(),
                    "payment_method" => $order->get_payment_method_title(),
                    "total" => wc_price($order->get_total(), 2),
                    "billing_first_name" => $order->get_billing_first_name(),
                    "billing_last_name" => $order->get_billing_last_name(),
                    "billing_company" => $order->get_billing_company(),
                    "billing_address_1" => $order->get_billing_address_1(),
                    "billing_address_2" => $order->get_billing_address_2(),
                    "billing_city" => $order->get_billing_city(),
                    "billing_state" => $billing_state_full_name,
                    "billing_postcode" => $order->get_billing_postcode(),
                    "billing_country" => $billing_country_full_name,
                    "billing_email" => $order->get_billing_email(),
                    "shipping_name" => $shipping_full_name,
                    "shipping_company" => $order->get_shipping_company(),
                    "shipping_address_1" => $order->get_shipping_address_1(),
                    "shipping_address_2" => $order->get_shipping_address_2(),
                    "shipping_city" => $order->get_shipping_city(),
                    "shipping_state" => $shipping_full_state_name,
                    "shipping_postcode" => $order->get_shipping_postcode(),
                    "shipping_country" => $shipping_country_full_name,
                    "shipping_phone" => $order->get_shipping_phone(),
                    "customer_note" => $order->get_customer_note(),
                    "product_name" => $product_name,
                    "product_image_url" => $product_image_url,
                    "product_price" => wc_price($product_price),
                    "product_sku" => $product_sku,
                    "product_attributes" => $product_attributes,
                    "purchase_note" => $purchase_note,
                    "quantity" => $item_qty,
                ];

            
                
                return [
                    'status' => 'success',
                    'data' => $item_data,
                    'message' => __( 'Last order item retrieved successfully.', 'emailkit' ),
                ];
            }
        }

        return [
            'status' => 'fail',
            'message' => __( 'No processing orders found or no items in the last order.', 'emailkit' ),
        ];
    }
}