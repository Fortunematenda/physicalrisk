<?php
namespace EmailKit\Admin;

use EmailKit\Admin\Emails\EmailLists;
Use EmailKitPro\Admin\TemplateManager;
defined( 'ABSPATH' ) || exit;

Class TemplateList{
    const  EMAILKIT_URL_TEMAPLTE_DIR = EMAILKIT_DIR. "includes/";
    const EMAILKIT_URL_TEMAPLTE_URL = EMAILKIT_URL. "includes/";
    const EMAILKIT_TEMAPLTE_DIR_PRO = EMAILKITPRO_DIR. "includes/";
   

    public static function get_templates(){
    
        
        $template_list = array_merge(

            self::get_new_order_template(),
            self::get_cancelled_order_template(),
            self::get_failed_order_template(),
            self::get_failed_order_template_customer(),
            self::get_completed_order_template(),
            self::get_processing_order_template(),
            self::get_refunded_order_template(),
            self::get_order_on_hold_template(),
            self::get_customer_invoice_order_details_template(),
            self::get_customer_note_template(),
            self::get_new_account_template(),
            self::get_reset_password_template(),
            self::get_low_stock_template(),
            self::get_no_stock_template(),
            self::get_back_order_template(),
            self::get_partial_refund_template(),
            self::get_payment_gateway_template(),
            self::get_wp_new_register_template(),
            self::get_wp_reset_password_template(),
            self::metform_email_template(),

        );

        return apply_filters( 'emailkit/editor/templates', $template_list );
    }

    public static function get_new_order_template(){

        return [
            'template-1' => [
                'id' => 1,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::NEW_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NEW_ORDER), 
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/new-order/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/new-order/1/content.json',
            ],

        ];
        
       
    }

    public static function get_cancelled_order_template(){

        return [

            'template-2' => [
                'id' => 2,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::CANCELLED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CANCELLED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/cancelled-order/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/cancelled-order/1/content.json',
                
            ],
            'template-24' => [
                'id' => 23,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::CANCELLED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CANCELLED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/cancelled-order/thumbnail/style_01.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/cancelled-order/1/content.json' :  ''
            ],
            'template-25' => [
                'id' => 24,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::CANCELLED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CANCELLED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/cancelled-order/thumbnail/style_02.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/cancelled-order/2/content.json' :  ''
            ],
            'template-26' => [
                'id' => 25,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::CANCELLED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CANCELLED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/cancelled-order/thumbnail/style_03.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/cancelled-order/3/content.json' :  ''
            ],
            'template-27' => [
                'id' => 26,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::CANCELLED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CANCELLED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/cancelled-order/thumbnail/style_04.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/cancelled-order/4/content.json' :  ''
            ],
            'template-28' => [
                'id' => 27,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::CANCELLED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CANCELLED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/cancelled-order/thumbnail/style_05.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/cancelled-order/5/content.json' :  ''
            ],
            
        ];
    }

    public static function get_failed_order_template(){

        return [ 
                'template-3' => [
                'id' => 3,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::FAILED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::FAILED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/failed-order/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/failed-order/1/content.json',
            ],
        ];    
    }

    public static function get_failed_order_template_customer(){

        return [ 
                'template-39' => [
                'id' => 38,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::FAILED_ORDER_CUSTOMER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::FAILED_ORDER_CUSTOMER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/failed-order-customer/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/failed-order-customer/1/content.json',
            ],
        ];
    }

    public static function get_completed_order_template(){

        return [

            'template-6' => [
                'id' => 6,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::COMPLETED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::COMPLETED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/completed-order/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/completed-order/1/content.json'
            ],
                

            
        ];
    }

    public static function get_processing_order_template(){

        return [
            'template-5' => [
                'id' => 5,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::PROCESSING_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PROCESSING_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/processing-order/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/processing-order/1/content.json',
            ],
            'template-19' => [
                'id' => 18,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::PROCESSING_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PROCESSING_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/processing-order/thumbnail/style_01.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/processing-order/1/content.json' :  ''
            ],

            'template-20' => [
                'id' => 19,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
               'title' =>  EmailLists::PROCESSING_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PROCESSING_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/processing-order/thumbnail/style_02.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/processing-order/2/content.json' :  ''
            ],

            'template-21' => [
                'id' => 20,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::PROCESSING_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PROCESSING_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/processing-order/thumbnail/style_03.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/processing-order/3/content.json' :  ''
            ],
            'template-22' => [
                'id' => 21,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::PROCESSING_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PROCESSING_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/processing-order/thumbnail/style_04.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/processing-order/4/content.json' :  ''
            ],
            'template-23' => [
                'id' => 22,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::PROCESSING_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PROCESSING_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/processing-order/thumbnail/style_05.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/processing-order/5/content.json' :  ''
            ],
        ];
    }

    public static function get_refunded_order_template(){

        return [
            'template-7' => [
                'id' => 7,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::REFUNDED_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::REFUNDED_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/refunded-order/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/refunded-order/1/content.json'
            ],
        ];
        
    }

    public static function get_order_on_hold_template(){

        return [
            'template-4' => [
                'id' => 4,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::ORDER_ON_HOLD,
                'template_title' => EmailLists::woocommerce_email(EmailLists::ORDER_ON_HOLD),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/order-on-hold/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/order-on-hold/1/content.json',
            ],

        ];
    }

    public static function get_customer_invoice_order_details_template(){

        return [

            'template-8' => [
                'id' => 8,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' => EmailLists::CUSTOMER_INVOICE_OR_ORDER_DETAILS,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CUSTOMER_INVOICE_OR_ORDER_DETAILS),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/customer-invoice/1/preview-thumb.svg',
                'demo-url'  => '',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/customer-invoice/1/content.json'
            ],
            
        ];

    }

    public static function get_customer_note_template(){

        return [

            'template-9' => [
                'id' => 9,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::CUSTOMER_NOTE,
                'template_title' => EmailLists::woocommerce_email(EmailLists::CUSTOMER_NOTE),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/customer-note/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/customer-note/1/content.json'
            ],
            
        ];
    }

    public static function get_new_account_template(){

        return [
            'template-10' => [
                'id' => 10,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::NEW_ACCOUNT,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NEW_ACCOUNT),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wc-new-account/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/wc-new-account/1/content.json'
            ],
            'template-29' => [
                'id' => 28,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::NEW_ACCOUNT,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NEW_ACCOUNT),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wc-new-account/thumbnail/style_01.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wc-new-account/1/content.json' :  ''
            ],

            'template-30' => [
                'id' => 29,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::NEW_ACCOUNT,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NEW_ACCOUNT),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wc-new-account/thumbnail/style_02.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wc-new-account/2/content.json' :  ''
            ],

            'template-31' => [
                'id' => 30,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::NEW_ACCOUNT,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NEW_ACCOUNT),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wc-new-account/thumbnail/style_03.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wc-new-account/3/content.json' :  ''
            ],

            'template-32' => [
                'id' => 31,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::NEW_ACCOUNT,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NEW_ACCOUNT),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wc-new-account/thumbnail/style_04.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wc-new-account/4/content.json' :  ''
            ],

            'template-33' => [
                'id' => 32,
                'package' => 'pro',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::NEW_ACCOUNT,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NEW_ACCOUNT),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wc-new-account/thumbnail/style_05.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wc-new-account/5/content.json' :  ''
            ],
            
        ];
    }

    public static function get_reset_password_template(){

        return [

            'template-11' => [
                'id' => 11,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::RESET_PASSWORD,
                'template_title' => EmailLists::woocommerce_email(EmailLists::RESET_PASSWORD),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wc-reset-password/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/wc-reset-password/1/content.json'
            ],
            
        ];
    }

    public static function get_low_stock_template(){

        return [
            'template-12' => [
                'id' => 12,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::LOW_STOCK,
                'template_title' => EmailLists::woocommerce_email(EmailLists::LOW_STOCK),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/low-stock/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/low-stock/1/content.json'
            ],
            
        ];
    }

    public static function get_no_stock_template(){

        return [
            'template-13' => [
                'id' => 13,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::NO_STOCK,
                'template_title' => EmailLists::woocommerce_email(EmailLists::NO_STOCK),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/no-stock/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/no-stock/1/content.json'
            ],
            
        ];

    }

    public static function get_back_order_template(){

        return [

            'template-14' => [
                'id' => 14,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::BACK_ORDER,
                'template_title' => EmailLists::woocommerce_email(EmailLists::BACK_ORDER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/back-order/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/back-order/1/content.json'
            ],
            
        ];
    }

    public static function get_partial_refund_template(){

        return [

            'template-18' => [
                'id' => 17,
                'package' => 'free',
                'mail_type' => 'woocommerce',
                'title' =>  EmailLists::PARTIAL_REFUND,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PARTIAL_REFUND),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/partial-refund/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/partial-refund/1/content.json'
            ],
            
        ];

    }

    public static function get_payment_gateway_template(){

        return [
            'template-40' => [
                'id'             => 39,
                'package'        => 'free',
                'mail_type'      => 'woocommerce',
                'title'          => EmailLists::PAYMENT_GATEWAY_ENABLED,
                'template_title' => EmailLists::woocommerce_email(EmailLists::PAYMENT_GATEWAY_ENABLED),
                'preview-thumb'  => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/payment-gateway/preview-thumb.svg',
                'demo-url'       => 'https://wpmet.com/',
                'file'           => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/payment-gateway/content.json',
            ],
        ];
    }

    public static function get_wp_new_register_template(){

        return [

            'template-15' => [
                'id' => 16,
                'package' => 'free',
                'mail_type' => 'wordpress',
                'title' =>  EmailLists::WP_NEW_REGISTER,
                'template_title' => EmailLists::wordpress_email(EmailLists::WP_NEW_REGISTER),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wp-new-register/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' =>  self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/wp-new-register/1/content.json' ,
            ],

            'template-34' => [
                'id' => 33,
                'package' => 'pro',
                'mail_type' => 'wordpress',
                'title' =>  EmailLists::WP_NEW_REGISTER,
                'template_title' =>  EmailLists::wordpress_email(EmailLists::WP_NEW_REGISTER),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wp-new-register/thumbnail/style_01.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wp-new-register/1/content.json' :  ''
            ],

            'template-35' => [
                'id' => 34,
                'package' => 'pro',
                'mail_type' => 'wordpress',
                'title' =>  EmailLists::WP_NEW_REGISTER,
                'template_title' =>  EmailLists::wordpress_email(EmailLists::WP_NEW_REGISTER),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wp-new-register/thumbnail/style_02.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wp-new-register/2/content.json' :  ''
            ],

            'template-36' => [
                'id' => 35,
                'package' => 'pro',
                'mail_type' => 'wordpress',
                'title' =>  EmailLists::WP_NEW_REGISTER,
                'template_title' =>  EmailLists::wordpress_email(EmailLists::WP_NEW_REGISTER),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wp-new-register/thumbnail/style_03.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wp-new-register/3/content.json' :  ''
            ],

            'template-37' => [
                'id' => 36,
                'package' => 'pro',
                'mail_type' => 'wordpress',
                'title' =>  EmailLists::WP_NEW_REGISTER,
                'template_title' =>  EmailLists::wordpress_email(EmailLists::WP_NEW_REGISTER),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wp-new-register/thumbnail/style_04.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wp-new-register/4/content.json' :  ''
            ],

            'template-38' => [
                'id' => 37,
                'package' => 'pro',
                'mail_type' => 'wordpress',
                'title' =>  EmailLists::WP_NEW_REGISTER,
                'template_title' =>  EmailLists::wordpress_email(EmailLists::WP_NEW_REGISTER),
                'preview-thumb' =>  self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wp-new-register/thumbnail/style_05.png',
                'demo-url'  => 'https://wpmet.com/',
                'file' => is_plugin_active('emailkit-pro/emailkit-pro.php') ? self::EMAILKIT_TEMAPLTE_DIR_PRO . 'Templates/wp-new-register/5/content.json' :  ''
            ],
            
        ];

    }

    public static function get_wp_reset_password_template(){

        return [

            'template-17' => [
                'id' => 102,
                'package' => 'free',
                'mail_type' => 'wordpress',
                'title' =>  EmailLists::WP_RESET_PASSWORD,
                'template_title' => EmailLists::wordpress_email(EmailLists::WP_RESET_PASSWORD),
                'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/wp-reset-password/1/preview-thumb.svg',
                'demo-url'  => 'https://wpmet.com/',
                'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/wp-reset-password/1/content.json'
            ],
            
        ];
    }

    public static function metform_email_template() {
    $templates = [];
    $metform_forms = get_posts([
        'post_type' => 'metform-form',
        'post_status' => 'publish',
        'numberposts' => -1,
        'orderby' => 'title',
        'order' => 'ASC',
    ]);

    // 3. Create a template entry for each form with consistent "Confirmation Mail To User" title
    foreach ($metform_forms as $form) {
        $form_id = $form->ID;
        $form_key = 'metform_form_' . $form_id;
        
        $templates[$form_key] = [
            'id' => $form_id,
            'package' => 'free',
            'mail_type' => 'metform',
            'title' => $form_key,
            'template_title' => esc_html__('Confirmation Mail To User', 'emailkit'),
            'preview-thumb' => self::EMAILKIT_URL_TEMAPLTE_URL . 'templates/metform/1/preview-thumb.svg',
            'demo-url' => get_permalink($form_id),
            'file' => self::EMAILKIT_URL_TEMAPLTE_DIR . 'templates/metform/1/content.json'
        ];
    }

    return $templates;
}





     public static function get(){

            $email_types = [
                
                'wordpress' => __('WordPress Email', 'emailkit'),
            ];

        // Include necessary WordPress files
        //   require_once ABSPATH . 'wp-admin/includes/plugin.php';
        //   require_once ABSPATH . 'wp-includes/class-wp.php';  // Adjust the path if necessary

          
            if(is_plugin_active(WP_PLUGIN_DIR . '/woocommerce/woocommerce.php')){
                $email_types['woocommerce'] = __('Woocommerce email', 'emailkit');
            }

            return apply_filters('emailkit_email_types',$email_types);
    }


    /**
     * Get template list by form type
     *
     * @param string $mail_type
     * @return array
     */
    public function get_templates_by_mail_type( $mail_type ) {
        $templates_list = [];

        // array filter
        $templates_list = array_filter( $this->get_templates(), function( $template ) use ( $mail_type ) {
            if(isset($template['mail_type'])){
                return $template['mail_type'] === $mail_type;
            }
            
            return true;
        } );

        return $templates_list;
    }

    public function get_template_contents($id){

        if(!array_key_exists($id, $this->get_templates()) || !file_exists($this->get_templates()[$id]['file'])){
            return null;
        }

        $template_file_url =  self::abs_path_to_url($this->get_templates()[$id]['file']);
        $content = wp_remote_get($template_file_url, ['sslverify' => false]);
        $content = json_decode(wp_remote_retrieve_body($content));

        return (!isset($content->content)) ? null : $content->content;
    }

    public static function abs_path_to_url( $path = '' ) {
		$url = str_replace(
			wp_normalize_path( untrailingslashit( ABSPATH ) ),
			site_url(),
			wp_normalize_path( $path )
		);
		return esc_url_raw( $url );
	}

}