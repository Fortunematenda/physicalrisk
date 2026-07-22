<?php

namespace EmailKit\Admin\Api;

defined('ABSPATH') || exit;

class ShortCodeData {
    /**
     * @var string
     */
    public $prefix = '';
    /**
     * @var string
     */
    public $param = '';
    /**
     * @var mixed
     */
    public $request = null;

    public function __construct() {
        add_action('rest_api_init', function () {
            register_rest_route('emailkit/v1', 'order-data', [
                'methods' => \WP_REST_Server::ALLMETHODS,
                'callback' => [$this, 'get_order_data'],
                'permission_callback' => '__return_true'
            ]);
        });
    }

    /**
     * @param $request
     */
    public function get_order_data($request) {
        if(!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
            return [
                'status' => 'fail',
                'message' => [ __( 'Nonce mismatch.', 'emailkit' )]
            ];
        }

        if(!is_user_logged_in() || !current_user_can('manage_options')) {
            return [
                'status' => 'fail',
                'message' => ['Access denied.']
            ];
        }

        
        
        $short_codes = [];
        $current_user = wp_get_current_user();
        $user_name = $current_user->user_login;
        $display_name = $current_user->display_name;
        $user_email = $current_user->user_email;
        $app_name = get_bloginfo('name');

        // Site shortcodes
        $short_codes[] = ['key' => 'site_name', 'value' => get_bloginfo( 'name' )];
        $short_codes[] = ['key' => 'site_url', 'value' => get_bloginfo( 'url')];
        $short_codes[] = ['key' => 'user_name', 'value' => $user_name];
        $short_codes[] = ['key' => 'display_name', 'value' => $display_name];
        $short_codes[] = ['key' => 'wp_user_email', 'value' => $user_email];
        $short_codes[] = ['key' => 'app_name', 'value' => $app_name];
        $short_codes[] = ['key' => 'user_login', 'value' =>  $user_name];


       if(is_plugin_active('woocommerce/woocommerce.php')) {

            // Payment gateway shortcodes
            $payment_gateways = WC()->payment_gateways()->get_available_payment_gateways();
            $first_gateway = !empty($payment_gateways) ? reset($payment_gateways) : null;
            $admin_email     = get_option('admin_email');
            $admin_user      = get_user_by('email', $admin_email);
            $short_codes[] = ['key' => 'gateway_title', 'value' => $first_gateway ? $first_gateway->get_method_title() : __('Check Payments', 'emailkit')];
            $short_codes[] = ['key' => 'gateway_settings_url', 'value' => $first_gateway ? esc_url(admin_url('admin.php?page=wc-settings&tab=checkout&section=' . $first_gateway->id)) : esc_url(admin_url('admin.php?page=wc-settings&tab=checkout'))];
            $short_codes[] = ['key' => 'username', 'value' => $admin_user ? $admin_user->user_login : $admin_email];
            $short_codes[] = ['key' => 'admin_email', 'value' => $admin_email];



            $orders = wc_get_orders([
                'limit' => 1,
                'orderby' => 'date',
                'order' => 'DESC',
                'status' => array_keys( wc_get_order_statuses()),
            ]);

            if(!empty($orders)) {

                $order = $orders[0];

            
                foreach($order->get_items() as $item_id => $item) {
                    $product = $item->get_product();
                    $short_codes[] = ['key' => 'product_name', 'value' => $product->get_name()];
                    $short_codes[] = ['key' => 'product_price', 'value' => wc_price($product->get_price())];
                }
               
                $customer = $order->get_user();

                // Include customer name and email in the order data
                if ($customer) {
                    $short_codes[] = ['key' => 'user_login', 'value' => $customer->display_name];
                    $short_codes[] = ['key' => 'user_email', 'value' => $customer->user_email];
                }
                // Order shortcodes
                $short_codes[] = ['key' => 'product_name', 'value' => 'T-Shirt with logo'];
                $short_codes[] = ['key' => 'quantity', 'value' => method_exists($order, 'get_item_count') ? $order->get_item_count() : '2'];
                $short_codes[] = ['key' => 'order_id', 'value' => method_exists($order, 'get_id') ? $order->get_id() : '1'];
                $short_codes[] = ['key' => 'order_status', 'value' => method_exists($order, 'get_status') ? $order->get_status() : 'pending'];
                $short_codes[] = ['key' => 'order_number', 'value' => method_exists($order, 'get_order_number') ? $order->get_order_number() : '1'];
                $short_codes[] = ['key' => 'order_currency', 'value' => method_exists($order, 'get_currency') ? $order->get_currency() : '$'];
                $short_codes[] = ['key' => 'order_subtotal', 'value' => method_exists($order, 'get_subtotal') ? wc_price($order->get_subtotal()) : '$0.00'];
                $short_codes[] = ['key' => 'order_date','value' => method_exists($order, 'get_date_created') ? date_i18n(get_option('date_format'), strtotime(get_date_from_gmt($order->get_date_created()->format('Y-m-d')))): date_i18n(get_option('date_format'), strtotime('2020-01-01')),];
                $short_codes[] = ['key' => 'payment_method', 'value' => method_exists($order, 'get_payment_method_title') ? $order->get_payment_method_title() : 'Cash On Delivery'];
                $short_codes[] = ['key' => 'total', 'value' => method_exists($order, 'get_total') ? wc_price($order->get_total(), 2) : '$0.00'];
                $short_codes[] = ['key' => 'customer_note', 'value' => method_exists($order, 'get_customer_note') ? ( !empty($order->get_customer_note()) ? $order->get_customer_note()  : __('Happy to order', 'emailkit') ) : __('Happy to order', 'emailkit')];
                // Billing shortcodes
                $short_codes[] = ['key' => 'billing_name', 'value' => method_exists($order, 'get_formatted_billing_full_name') ? $order->get_formatted_billing_full_name() : 'Jon Doe'];
                $short_codes[] = ['key' => 'billing_first_name', 'value' => method_exists($order, 'get_billing_first_name') ? $order->get_billing_first_name() : 'Jon'];
                $short_codes[] = ['key' => 'billing_last_name', 'value' => method_exists($order, 'get_billing_last_name') ? $order->get_billing_last_name() : 'Doe'];
                $short_codes[] = ['key' => 'billing_email', 'value' => method_exists($order, 'get_billing_email') ? $order->get_billing_email() : 'jondoe@example.com'];
                $short_codes[] = ['key' => 'billing_phone', 'value' => method_exists($order, 'get_billing_phone') ? $order->get_billing_phone() : '3456789'];
                $short_codes[] = ['key' => 'billing_company', 'value' => method_exists($order, 'get_billing_company') ? $order->get_billing_company() : 'xyz.com'];
                $short_codes[] = ['key' => 'billing_address_1', 'value' => method_exists($order, 'get_billing_address_1') ? $order->get_billing_address_1() : 'USA'];
                $short_codes[] = ['key' => 'billing_address_2', 'value' => method_exists($order, 'get_billing_address_2') ? $order->get_billing_address_2() : 'USA'];
                $short_codes[] = ['key' => 'billing_city', 'value' => method_exists($order, 'get_billing_city') ? $order->get_billing_city() : 'USA'];
                $short_codes[] = ['key' => 'billing_country', 'value' => method_exists($order, 'get_billing_country') ? $order->get_billing_country() : 'America'];
                $short_codes[] = ['key' => 'billing_postcode', 'value' => method_exists($order, 'get_billing_postcode') ? $order->get_billing_postcode() : '123456'];
                $short_codes[] = ['key' => 'billing_state', 'value' => method_exists($order, 'get_billing_state') ? $order->get_billing_state() : 'NORTH CAROLINA'];
                
                // Shipping shortcodes
                $short_codes[] = ['key' => 'shipping_first_name', 'value' => method_exists($order, 'get_shipping_first_name') ? $order->get_shipping_first_name() : 'Jon'];
                $short_codes[] = ['key' => 'shipping_last_name', 'value' => method_exists($order, 'get_shipping_last_name') ? $order->get_shipping_last_name() : 'Doe'];
                $short_codes[] = ['key' => 'shipping_total', 'value' => method_exists($order, 'get_shipping_total') ? wc_price($order->get_shipping_total()) : '$0.00'];
                $short_codes[] = ['key' => 'shipping_tax_total', 'value' => method_exists($order, 'get_shipping_tax') ? wc_format_decimal($order->get_shipping_tax(), 2) : '$0.00'];
                $short_codes[] = ['key' => 'shipping_company', 'value' => method_exists($order, 'get_shipping_company') ? $order->get_shipping_company() : 'xyz.com'];
                $short_codes[] = ['key' => 'shipping_address_1', 'value' => method_exists($order, 'get_shipping_address_1') ? $order->get_shipping_address_1() : 'USA'];
                $short_codes[] = ['key' => 'shipping_address_2', 'value' => method_exists($order, 'get_shipping_address_2') ? $order->get_shipping_address_2() : 'USA'];
                $short_codes[] = ['key' => 'shipping_method', 'value' => method_exists($order, 'get_shipping_method') ? $order->get_shipping_method() : 'Cash'];
                $short_codes[] = ['key' => 'shipping_city', 'value' => method_exists($order, 'get_shipping_city') ? $order->get_shipping_city() : 'America'];
                $short_codes[] = ['key' => 'shipping_state', 'value' => method_exists($order, 'get_shipping_state') ? $order->get_shipping_state() : 'North Carolina'];
                $short_codes[] = ['key' => 'shipping_postcode', 'value' => method_exists($order, 'get_shipping_postcode') ? $order->get_shipping_postcode() : '123456'];
                $short_codes[] = ['key' => 'shipping_country', 'value' => method_exists($order, 'get_shipping_country') ? $order->get_shipping_country() : 'America'];
                $short_codes[] = ['key' => 'shipping_phone', 'value' => method_exists($order, 'get_shipping_phone') ? $order->get_shipping_phone() : '3456789'];
        
              

                return [
                    'status' => 'success',
                    'data'   => $short_codes,
                    'message'=> esc_html__( 'WooCommerce order data retrieved successfully.', 'emailkit')
                ];
            }
        else {

            return $this->get_demo_data();
        }
           
        }
            return $this->get_demo_data();
    }

    public function get_demo_data() {

        $site_url = get_bloginfo('url');
        $current_user = wp_get_current_user();
        $user_name = $current_user->user_login;
        $display_name = $current_user->display_name;
        $user_email = $current_user->user_email;
        $app_name = get_bloginfo('name');

        $demo_data = [
            ['key' => 'order_id', 'value' => '1'],
            ['key' => 'order_number', 'value' => '1'],
            ['key' => 'order_status', 'value' => 'pending'],
            ['key' => 'billing_name', 'value' => 'Jon Doe'],
            ['key' => 'quantity', 'value' => '2'],
            ['key' => 'order_currency', 'value' => '$'],
            ['key' => 'billing_phone', 'value' => '3456789'],
            ['key' => 'shipping_total', 'value' => '$0.00'],
            ['key' => 'order_subtotal', 'value' => '$0.00'],
            ['key' => 'shipping_tax_total', 'value' => '$0.00'],
            ['key' => 'order_date', 'value' => '2020-01-01 00:00:00'],
            ['key' => 'shipping_method', 'value' => 'Cash'],
            ['key' => 'payment_method', 'value' => 'Cash On Delivery'],
            ['key' => 'total', 'value' => '$0.00'],
            ['key' => 'billing_first_name', 'value' => 'Jon'],
            ['key' => 'billing_last_name', 'value' => 'Doe'],
            ['key' => 'billing_company', 'value' => 'xyz.com'],
            ['key' => 'billing_address_1', 'value' => 'USA'],
            ['key' => 'billing_address_2', 'value' => 'USA'],
            ['key' => 'billing_city', 'value' => 'USA'],
            ['key' => 'billing_state', 'value' => 'NORTH CAROLINA'],
            ['key' => 'billing_postcode', 'value' => '123456'],
            ['key' => 'billing_country', 'value' => 'America'],
            ['key' => 'billing_email', 'value' => 'jondoe@example.com'],
            ['key' => 'shipping_first_name', 'value' => 'Jon'],
            ['key' => 'shipping_last_name', 'value' => 'Doe'],
            ['key' => 'shipping_company', 'value' => 'xyz.com'],
            ['key' => 'shipping_address_1', 'value' => 'USA'],
            ['key' => 'shipping_address_2', 'value' => 'USA'],
            ['key' => 'shipping_city', 'value' => 'America'],
            ['key' => 'shipping_state', 'value' => 'North Carolina'],
            ['key' => 'shipping_postcode', 'value' => '123456'],
            ['key' => 'shipping_country', 'value' => 'America'],
            ['key' => 'shipping_phone', 'value' => '3456789'],
            ['key' => 'customer_note', 'value' => 'Happy To order'],
            ['key' => 'site_name', 'value' => get_bloginfo( 'name' )],
            ['key' => 'site_url', 'value' => $site_url],
            ['key' => 'user_name', 'value' => $user_name],
            ['key' => 'product_name', 'value' => 'T-Shirt with logo'],
            ['key' => 'admin_email', 'value' => 'admin@site.com'],
            ['key' => 'user_login', 'value' => 'admin'],
            ['key' => 'user_email', 'value' => 'jondoe@example.com'],
            ['key' => 'site_url', 'value' => $site_url],
            ['key' => 'display_name', 'value' => $display_name],
            ['key' => 'wp_user_email', 'value' => $user_email],
            ['key' => 'app_name', 'value' => $app_name],
            ['key' => 'gateway_title', 'value' => 'Check Payments'],
            ['key' => 'gateway_settings_url', 'value' => admin_url('admin.php?page=wc-settings&tab=checkout&section=cheque')],
            ['key' => 'username', 'value' => 'admin'],
        ];

        return [
            'status' => 'success',
            'data' => $demo_data,
            'message' => __( 'No WooCommerce orders found. Returning demo data.', 'emailkit')
        ];
    }
}
