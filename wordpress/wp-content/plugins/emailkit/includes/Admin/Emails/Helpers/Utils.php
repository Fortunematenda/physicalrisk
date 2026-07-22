<?php 

namespace EmailKit\Admin\Emails\Helpers;

defined("ABSPATH") || exit;

class Utils
{
    public static function get_kses_array()
    {
        return array(
            'html'                          => array(),
            'head'                          => array(),
            'body'                          => array(),
            'hr'                            => array(),
            'address'                       => array(),
            'a'                             => array(
                'class'  => array(),
                'href'   => array(),
                'rel'    => array(),
                'title'  => array(),
                'target' => array(),
                'style'  => array(),
            ),
            'abbr'                          => array(
                'title' => array(),
                'style'  => array(),
            ),
            'b'                             => array(
                'class' => array(),
                'style'  => array(),
            ),
            'blockquote'                    => array(
                'cite' => array(),
                'style'  => array(),
            ),
            'cite'                          => array(
                'title' => array(),
                'style'  => array(),
            ),
            'code'                          => array(
                'style'  => array(),
            ),
            'pre'                           => array(
                'style'  => array(),
            ),
            'del'                           => array(
                'datetime' => array(),
                'title'    => array(),
                'style'  => array(),
            ),
            'dd'                            => array(
                'style'  => array(),
            ),
            'div'                           => array(
                'class' => array(),
                'title' => array(),
                'style' => array(),
            ),
            'dl'                            => array(
                'style' => array(),
            ),
            'dt'                            => array(
                'style' => array(),
            ),
            'em'                            => array(
                'style' => array(),
            ),
            'strong'                        => array(
                'style' => array(),
            ),
            'h1'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'h2'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'h3'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'h4'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'h5'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'h6'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'i'                             => array(
                'class' => array(),
                'style' => array(),
            ),
            'img'                           => array(
                'alt'        => array(),
                'class'        => array(),
                'height'    => array(),
                'src'        => array(),
                'width'        => array(),
                'style'        => array(),
                'title'        => array(),
                'srcset'    => array(),
                'loading'    => array(),
                'sizes'        => array(),
                'style' => array(),
            ),
            'figure'                        => array(
                'class'        => array(),
                'style' => array(),
            ),
            'li'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'ol'                            => array(
                'class' => array(),
                'style' => array(),
            ),
            'p'                             => array(
                'class' => array(),
                'style' => array(),
            ),
            'q'                             => array(
                'cite'  => array(),
                'title' => array(),
                'style' => array(),
            ),
            'span'                          => array(
                'class' => array(),
                'title' => array(),
                'style' => array(),
            ),
            'iframe'                        => array(
                'width'       => array(),
                'height'      => array(),
                'scrolling'   => array(),
                'frameborder' => array(),
                'allow'       => array(),
                'src'         => array(),
                'style' => array(),
            ),
            'strike'                        => array(),
            'br'                            => array(),
            'table'                         => array(),
            'thead'                         => array(),
            'tbody'                         => array(
                'width'       => array(),
                'height'      => array(),
                'scrolling'   => array(),
                'frameborder' => array(),
                'allow'       => array(),
                'src'         => array(),
                'style' => array()
            ),
            'tfoot'                         => array(),
            'tr'                            => array(
                'width'       => array(),
                'height'      => array(),
                'scrolling'   => array(),
                'frameborder' => array(),
                'allow'       => array(),
                'src'         => array(),
                'style' => array()
            ),
            'td'  => array(
                'class' => array(),
            ),
            'th'                            => array(),
            'colgroup'                      => array(),
            'col'                           => array(),
            'strong'                        => array(),
            'data-wow-duration'             => array(),
            'data-wow-delay'                => array(),
            'data-wallpaper-options'        => array(),
            'data-stellar-background-ratio' => array(),
            'ul'                            => array(
                'class' => array(),
            ),
            'button'                        => array(
                'disabled' => array(),
                'id' => array(),
                'class' => array(),
                'style' => array(),
                'target' => array(),
                'href' => array(),
                'data-editor-template-url' => array(),
                'data-emailkit-email-type' => array(),
                'data-emailkit-template-title' => array(),
                'data-emailkit-template-type' => array(),
                'data-emailkit-template' => array(),
            ),
            'svg'                           => array(
                'class'           => true,
                'aria-hidden'     => true,
                'aria-labelledby' => true,
                'role'            => true,
                'xmlns'           => true,
                'width'           => true,
                'height'          => true,
                'viewbox'         => true, // <= Must be lower case!
                'preserveaspectratio' => true,
            ),
            'g'                             => array('fill' => true),
            'title'                         => array('title' => true),
            'path'                          => array(
                'd'    => true,
                'fill' => true,
            ),
            'input'                            => array(
                'class'        => array(),
                'type'        => array(),
                'value'        => array()
            )
        );
    }

    public static function kses($raw)
    {

        $allowed_tags = self::get_kses_array();

        if (function_exists('wp_kses')) { // WP is here
            return wp_kses($raw, $allowed_tags);
        } else {
            return $raw;
        }
    }

    public static function mail_shortcode_filter(string $input) : string {
        
        // find the shortcode
        $pattern = '/<span data-shortcode="{{([^<>]+)}}">([\s\S]*?)<\/span>/';

        //  getting all shortcode matches from mail content 
        preg_match_all($pattern, $input, $matches, PREG_SET_ORDER);

        // Loop through each match and replace the content inside the span tag
        foreach ($matches as $match) {
            $shortcode = $match[1]; // Content inside the data-shortcode attribute
            $oldContent = $match[2]; // Content inside the span tag

            // replaceing the shortcode 
            $replacement = '<span>{{' . $shortcode . '}}</span>';
            $input = str_replace($match[0], $replacement, $input);
        }
        
        return  $input;
    }

    /**
    * Adjust the price structure for left or left_space currency symbol positions.
    *
    * @param string $message The HTML message content to process.
    * @return string The updated message with corrected price structure.
    */
    public static function adjust_price_structure($message) {
        return preg_replace_callback(
            '/<span class="woocommerce-Price-currencySymbol">(.*?)<\/span>([\d.,]+)<\/bdi><\/span><\/span>\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)<\/bdi><\/span><\/span>/',
            function ($matches) {
                // Rebuild the correct price structure
                return '<span class="woocommerce-Price-currencySymbol">' 
                    . $matches[1] . '</span>' 
                    . $matches[2] . '</bdi></span>';
            },
            $message
        );
    } 

    public static function adjust_left_space_price_structure($message) {
        return preg_replace_callback(
            '/<span><span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">([^<]+)<\/span>&nbsp;([\d.,]+)<\/bdi><\/span><\/span>&nbsp;[\d.,]+<\/bdi><\/span><\/span>/',
            function ($matches) {
                return '<span class="woocommerce-Price-amount amount"><bdi><span class="woocommerce-Price-currencySymbol">'
                    . $matches[1] . '</span>&nbsp;' . $matches[2] . '</bdi></span>';
            },
            $message
        );
    }

    public static function order_items_replace(string $document, array $replacements ){
		
		// Patterns for different classes
        $patterns = [
            'order_items' => '/<tr[^>]*class="order_items"[^>]*>.*?<\/tr>/s',
            'order_item_price' => '/<tr[^>]*class="order_item_price"[^>]*>.*?<\/tr>/s',
            'order_quantity' => '/<tr[^>]*class="order_quantity"[^>]*>.*?<\/tr>/s',
        ];
    
        foreach ($patterns as $key => $pattern) {
            // Match rows with the specified class
            preg_match_all($pattern, $document, $matches);
    
            if (!empty($matches[0])) {
                $rows = '';
    
                // Iterate through each matched row
                foreach ($matches[0] as $originalRow) {
                    // Duplicate the row for each replacement
                    foreach ($replacements as $replacement) {
                        // Replace placeholders in the duplicated row
                        $placeholders = ["{{product_name}}", "{{quantity}}", "{{total}}", "{{product_price}}", "{{product_image_url}}", "{{product_sku}}", "{{product_attributes}}", "{{purchase_note}}"];
                        $newRow = str_replace($placeholders, $replacement, $originalRow);
                        
                        // If purchase note is empty, remove the purchase_note_wrapper
                        if (empty($replacement[7])) {
                            $newRow = preg_replace('/<p[^>]*class="purchase_note_wrapper"[^>]*>.*?<\/p>/s', '', $newRow);
                            $newRow = preg_replace('/<div[^>]*class="purchase_note_wrapper"[^>]*>.*?<\/div>/s', '', $newRow);
                        }
                        
                        $rows .= $newRow;
                    }
                }
    
                // Replace the matched rows in the document
                $document = preg_replace($pattern, $rows, $document);
            }
        }

		return $document;
	}

     // Helper function to escape quotes
     public static function escape_quotes($data) {
        if (is_string($data)) {
            return addslashes($data);
        } elseif (is_array($data)) {
            return array_map('escape_quotes', $data);
        }
        return $data;
    }

    // Function to transform keys from {{order_number}} format to [order_number] format
    public static function transform_details_keys($details) {
        $transformed_details = [];
        foreach ($details as $key => $value) {
            $new_key = str_replace(['{{', '}}'], ['[', ']'], $key);
            $transformed_details[$new_key] = $value;
        }
        return $transformed_details;
    }

    public static function woocommerce_order_email_contents($order){

        // Check if WooCommerce is active
        if (!function_exists('wc_get_order')) {
            return []; // Return empty array if WooCommerce is not active
        }
    
        $customer_note = $order->get_customer_note();
        $shipping_first_name = $order->get_shipping_first_name();
        $shipping_last_name = $order->get_shipping_last_name();
        $shipping_full_name = $shipping_first_name . ' ' . $shipping_last_name;


        
        $billing_country_code = $order->get_billing_country();
        $billing_country_full_name = WC()->countries->countries[ $billing_country_code ];
        $billing_state_code = $order->get_billing_state();
        $billing_states = WC()->countries->get_states($billing_country_code);

        $billing_state_full_name = is_array($billing_states) && isset($billing_states[$billing_state_code]) ? $billing_states[$billing_state_code] : $billing_state_code;
        
        $shipping_country_code = $order->get_shipping_country();
        $shipping_country_full_name = (!empty($shipping_country_code) && isset(WC()->countries->countries[$shipping_country_code]))? WC()->countries->countries[$shipping_country_code]: '';
        $shipping_states = WC()->countries->get_states($shipping_country_code);
        $shipping_state_code = $order->get_shipping_state();
                
        $shipping_full_state_name = is_array($shipping_states) && isset($shipping_states[$shipping_state_code]) ? $shipping_states[$shipping_state_code] : $shipping_state_code;

        $subtotal = $order->get_subtotal();
        $total_refunded = $order->get_total_refunded();
        $total = $order->get_total();
        
        // Determine the formatted total using a ternary operator
        $formatted_total = ($total_refunded == $total) 
            ? '<del aria-hidden="true">' . wc_price($total_refunded) . '</del> ' . '<ins>' . wc_price($total - $total_refunded) . '</ins>'  // Fully refunded
            : ($total_refunded > 0 
                ? '<del aria-hidden="true">' . wc_price($subtotal) . '</del> ' . '<u>' . wc_price($subtotal - $total_refunded) . '</u>'   // Partially refunded
                : wc_price($total, 2));
        
        $total_order_quantity = 0;
        foreach ($order->get_items() as $item) {
            $total_order_quantity += $item->get_quantity();
            $product_names[] = $item->get_name();
        }

        $product_names_string = implode(', ', $product_names);

        $order_date = $order->get_date_created()->format('Y-m-d H:i:s');
        // Convert the order date to the site's local timezone
        $localized_date = get_date_from_gmt($order_date);
        // Get the site's date and time formats
        $date_format = get_option('date_format');
        $time_format = get_option('time_format');
        // Format the date and time separately
        $formatted_date = date_i18n($date_format, strtotime($localized_date));
        $formatted_time = date_i18n($time_format, strtotime($localized_date));

        $details = [
            "{{order_id}}" =>  $order->get_id(),
            "{{order_number}}" => $order->get_order_number(),
            "{{order_status}}" => $order->get_status(),
            "{{customer_note}}" => $customer_note,
            "{{shipping_total}}" => wc_price( $order->get_shipping_total() ),
            "{{order_subtotal}}" => wc_price( $order->get_subtotal()),
            "{{order_currency}}" => $order->get_currency(),
            "{{order_fully_refunded}}" => '-'.wc_price($order->get_total_refunded(), 2),
            "{{partial_refund_amount}}" =>  '-'.  wc_price($order->get_total_refunded(), 2),
            "{{remaining_refund_amount}}" => '-'.$order->get_remaining_refund_amount(),
            "{{billing_phone}}" => $order->get_billing_phone(),
            "{{shipping_tax_total}}" => wc_format_decimal($order->get_shipping_tax(), 2),
            "{{order_date}}" => $formatted_date,
            "{{order_time}}" => $formatted_time,
            "{{shipping_method}}" => $order->get_shipping_method(),
            "{{payment_method}}" => $order->get_payment_method_title(),
            "{{total}}" => $formatted_total,
            "{{billing_name}}"   => $order->get_formatted_billing_full_name(),
            "{{billing_first_name}}" => $order->get_billing_first_name(),
            "{{billing_last_name}}" =>  $order->get_billing_last_name(),
            "{{billing_company}}" => $order->get_billing_company(),
            "{{billing_address_1}}" => $order->get_billing_address_1(),
            "{{billing_address_2}}" => $order->get_billing_address_2(),
            "{{billing_city}}" => $order->get_billing_city(),
            "{{billing_state}}" => $billing_state_full_name,
            "{{billing_postcode}}" => $order->get_billing_postcode(),
            "{{billing_country}}" => $billing_country_full_name,
            "{{billing_email}}"    => $order->get_billing_email(),
            "{{shipping_name}}" => $shipping_full_name,
            "{{shipping_first_name}}" => $shipping_first_name,
            "{{shipping_last_name}}" => $shipping_last_name,
            "{{shipping_company}}" => $order->get_shipping_company(),
            "{{shipping_address_1}}" => $order->get_shipping_address_1(),
            "{{shipping_address_2}}" => $order->get_shipping_address_2(),
            "{{shipping_city}}" => $order->get_shipping_city(),
            "{{shipping_state}}" => $shipping_full_state_name,
            "{{shipping_postcode}}" => $order->get_shipping_postcode(),
            "{{shipping_country}}" => $shipping_country_full_name,
            "{{shipping_phone}}" => $order->get_shipping_phone(),
            "{{customer_note}}" => $order->get_customer_note(),
            "{{download_permissions}}" => $order->is_download_permitted() ? $order->is_download_permitted() : 0,
            "{{quantity}}"             => $total_order_quantity,
            "{{product_name}}"        => $product_names_string,
            "{{site_name}}" => get_bloginfo('name'),
            "{{site_url}}" => get_bloginfo('url'),	
        ];

        return $details;
    }

    public static function woocommerce_stock_email_contents($product) {

        // Check if WooCommerce is active
        if (!function_exists('wc_get_product')) {
            return []; // Return empty array if WooCommerce is not active
        }

        $details = [

            "{{stock_status}}"  	=>  $product->get_stock_status(),
			"{{product_name}}"     	=>  $product->get_name(),
			"{{stock_quantity}}"	=>  $product->get_stock_quantity(),
			"{{status}}"        	=>  $product->get_status(),
			"{{product_id}}"    	=>  $product->get_id(),
			"{{short_description}}" => 	$product->get_short_description(),
			"{{product_price}}"     => 	$product->get_price(),
			"{{manage_stock}}"      => 	$product->get_manage_stock(),
			"{{sku}}"               => 	$product->get_sku(),
			"{{low_stock_amount}}"  => 	$product->get_low_stock_amount(),
			"{{backorders}}"        => 	$product->get_backorders(),
			"{{site_name}}"         => 	get_bloginfo('name'),
            "{{display_name}}"      =>  wp_get_current_user()->display_name,
            
        ];

        return $details;
    }


    /**
     * Convert bundled template image paths to the current site's absolute plugin URLs.
     */
    public static function normalize_template_asset_urls($content)
    {
        if (!is_string($content) || $content === '') {
            return $content;
        }

        $site_base_url = trailingslashit(home_url());
        $emailkit_pro_url = $site_base_url . 'wp-content/plugins/emailkit-pro/';

        if (!function_exists('is_plugin_active')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $is_emailkit_pro_active = is_plugin_active('emailkit-pro/emailkit-pro.php');

        if ($is_emailkit_pro_active) {

            return str_replace(
                [
                    'https://demo.wpmet.com/emailkit/wp-content/plugins/emailkit-pro/',
                    'http://demo.wpmet.com/emailkit/wp-content/plugins/emailkit-pro/',
                    '/wp-content/plugins/emailkit-pro/',
                ],
                [
                    $emailkit_pro_url,
                    $emailkit_pro_url,
                    $emailkit_pro_url,
                ],
                $content
            );
        }

        return $content;
    }
}