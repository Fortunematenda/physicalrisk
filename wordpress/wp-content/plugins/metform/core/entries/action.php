<?php

namespace MetForm\Core\Entries;

use MetForm_Pro\Utils\Helper;

defined('ABSPATH') || exit;

class Action
{
    use \MetForm\Traits\Singleton;

    private $key_form_id;
    private $key_form_data;
    //private $key_form_settings;
    private $key_browser_data;
    private $key_form_total_entries;
    private $key_form_file;
    private $key_payment_status;
    private $post_type;

    private $fields;
    private $entry_id;
    private $entry_serial_no;
    private $form_id;
    private $form_data;
    private $form_settings;
    private $title;
    private $entry_count;
    private $email_name;
    private $file_upload_info;

    private $inserted_form_data;

    private $response;

    public function __construct()
    {
        $this->response = (object) [
            'status' => 0,
            'store_entries' => 1,
            'error' => [
                esc_html__('Something went wrong.', 'metform'),
            ],
            'data' => [
                'message' => '',
            ],
        ];

        //$this->key_form_settings = 'metform_form__form_setting';
        $this->key_form_total_entries = 'metform_form__form_total_entries';
        $this->key_browser_data = 'metform_form__entry_browser_data';
        $this->key_form_id = 'metform_entries__form_id';
        $this->key_form_data = 'metform_entries__form_data';
        $this->key_form_file = 'metform_entries__file_upload_new';
        $this->key_payment_status = 'metform_entries__payment_status';
        $this->post_type = Base::instance()->cpt->get_name();
    }

    public function submit($form_id, $form_data, $file_data, $page_id = '')
    {
        
        $hidden_fields = isset($form_data['hidden-fields']) ? json_decode($form_data['hidden-fields'], true) : [];

        foreach ($hidden_fields as $key) {
            unset($form_data[$key]);
        }

        // if form is not published return
        $current_status = get_post_status ( $form_id );

        if( 'trash' == $current_status || ( !current_user_can( 'edit_posts') && 'draft' == $current_status)  ){
            $this->response->error[0] = esc_html__('You are not permitted to access this form', 'metform');
            return $this->response;
        }

        $this->fields = $this->get_fields($form_id);
        if(isset($this->fields['mf-recaptcha']) && !isset($form_data['g-recaptcha-response']) && !isset($form_data['g-recaptcha-response-v3']))  {
            $this->response->status = 0;
            $this->response->error[] = esc_html__('Unauthorized submission.', 'metform');
            return $this->response;
        }
        if(isset($this->fields['mf-simple-captcha']) && !isset($form_data['mf-captcha-challenge'])){
            $this->response->status = 0;
            $this->response->error[] = esc_html__('Unauthorized submission.', 'metform');
            return $this->response;
        }

        // check for file widget
        if ($this->get_input_name_by_widget_type('mf-file-upload')) {
            $mf_files = $this->get_input_name_by_widget_type('mf-file-upload');
            $response =  File_Data_Validation::check_files($mf_files, $file_data, $this->fields);

            if(isset($response['status']) && $response['status'] == 0){
                $this->response->status = 0;
                $this->response->error[0] = $response['error'] ?? esc_html__('File size exceeded.', 'metform');
                return $this->response;
            }
        
            // validate files
            if (count(File_Data_Validation::validate($this->fields, $file_data)) > 0) {
                $this->response->status = 0;
                $this->response->error[] = esc_html__('You are trying to upload wrong file!', 'metform');
                return $this->response;
            }
        }


        $this->form_id = $form_id;
        $this->title = get_the_title($this->form_id);
        $this->form_settings = \MetForm\Core\Forms\Action::instance()->get_all_data($form_id);

        $this->response->data['hide_form'] = (!isset($this->form_settings['hide_form_after_submission']) ? '' : $this->form_settings['hide_form_after_submission']);

        $this->response->data['form_data'] = $form_data;

        // Form scheduling: prevent submission after end time
        if (
            isset($this->form_settings['form_scheduling_status'])
            && $this->form_settings['form_scheduling_status'] == '1'
        ) {
            $current_ts = current_time('timestamp');
            $end_time   = $this->form_settings['mf_scheduling_submission_ends'];
            $end_ts     = $end_time ? strtotime(str_replace('T', ' ', $end_time)) : 0;

            if ($end_ts && $current_ts > $end_ts) {
                $expired_message = !empty($this->form_settings['mf_scheduling_form_expired_message'])
                    ? $this->form_settings['mf_scheduling_form_expired_message']
                    : esc_html__('Form submission is now closed.', 'metform');

                $this->response->status = 0;
                $this->response->error  = [ $expired_message ];
                $this->response->data['message'] = $expired_message;

                return $this->response;
            }
        }

        $email_name = $this->get_input_name_by_widget_type('mf-email')?? [];

      
        if(count($email_name) > 0 && class_exists('\MetForm_Pro\Core\Features\Entries\Unique_Validation')){

            $validated_data =  \MetForm_Pro\Core\Features\Entries\Unique_Validation::check_unique_fields($form_id, $form_data, $this->fields );
           
            if($validated_data['status'] === 1){
                $this->response->status = 0;
                $this->response->error = [];
                $this->response->error[0] = sprintf(esc_html__('%1$s %2$s already exist.', 'metform'), $validated_data['input_label'], $validated_data['duplicate_field']);
                return $this->response;
            }
        }

        
        

        $this->email_name = (isset($email_name[0]) ? $email_name[0] : null);

        // nonce check
        if (!$this->mf_is_woo_exists()) {
            if (!isset($form_data['form_nonce']) || !wp_verify_nonce($form_data['form_nonce'], 'form_nonce')) {
                $this->response->status = 0;
                $this->response->error[] = esc_html__('Unauthorized submission.', 'metform');
                return $this->response;
            }
        }


        // validate form with max length, min length, length type and expression
        $validate = $this->validate_form_data($form_data);
        if ($validate == false) {
            $this->response->status = 0;
            $this->response->error =  [ esc_html__('Form validation failed', 'metform') ];
            return $this->response;
        }

        $filter_validate = apply_filters('mf_after_validation_check', ['is_valid' => $validate, 'form_data' => $form_data , 'file_data' => $file_data]);
        
        if (isset($filter_validate['is_valid']) && $filter_validate['is_valid'] == false) {
            $this->response->status = 0;
            $this->response->error =  [ $filter_validate['message'] ?? esc_html__('Form validation failed', 'metform') ];
            return $this->response;
        }

        // google recaptcha condition and action
        if ((isset($form_data['g-recaptcha-response']) || isset($form_data['g-recaptcha-response-v3'])) && (isset($this->fields['mf-recaptcha'])) && (isset($this->form_settings['mf_recaptcha_site_key'])) && $this->form_settings['mf_recaptcha_site_key'] != '') {
            if (isset($form_data['g-recaptcha-response']) && ($form_data['g-recaptcha-response'] == "")) {
                $this->response->status = 0;
                $this->response->error[] = esc_html__('Please solve the recaptcha.', 'metform');
                return $this->response;
            }

            if ((isset($this->form_settings['mf_recaptcha_version']) && ($this->form_settings['mf_recaptcha_version'] == 'recaptcha-v3')) && (!isset($form_data['g-recaptcha-response-v3']) || ($form_data['g-recaptcha-response-v3'] == ""))) {
                $this->response->status = 0;
                $this->response->error[] = esc_html__('Google captcha token not found.', 'metform');
                return $this->response;
            }

            if ((isset($this->form_settings['mf_recaptcha_version']) && ($this->form_settings['mf_recaptcha_version'] == 'recaptcha-v2')) && isset($form_data['g-recaptcha-response'])) {
                $response = \MetForm\Core\Integrations\Google_Recaptcha::instance()->verify_captcha_v2($form_data, $this->form_settings);
            }

            if ((isset($this->form_settings['mf_recaptcha_version']) && ($this->form_settings['mf_recaptcha_version'] == 'recaptcha-v3')) && isset($form_data['g-recaptcha-response-v3'])) {
                $response = \MetForm\Core\Integrations\Google_Recaptcha::instance()->verify_captcha_v3($form_data, $this->form_settings);
            }

            //$this->response->data['responseKeys'] = $response['responseKeys'];
            $this->response->status = $response['status'];
            if ($response['status'] == 0) {
                $this->response->error[] = (isset($response['error']) ? $response['error'] : '');
                return $this->response;
            }
        }

        // Captcha solve conditiona and action
        if (isset($form_data['mf-captcha-challenge'])) {
            if (($form_data['mf-captcha-challenge']) == "") {
                $this->response->status = 0;
                $this->response->error = [ esc_html__('Please solve the recaptcha.', 'metform') ];
                return $this->response;
            }

            session_start();

            if(!empty($_SERVER['REQUEST_TIME'])){
                $time = sanitize_text_field(wp_unslash($_SERVER['REQUEST_TIME']));
            }

            $timeout_duration = 1800;

            if (
                isset($_SESSION['LAST_ACTIVITY']) && ($time - $_SESSION['LAST_ACTIVITY']) > $timeout_duration
            ) {
                session_unset();
                session_destroy();
                session_start();
            }

            $_SESSION['LAST_ACTIVITY'] = $time;

            if (!isset($_SESSION['mf_captcha_text'])) {
                $this->response->status = 0;
                $this->response->error = [ esc_html__('Time out of this captcha. Please reload or choose another one.', 'metform') ];
                return $this->response;
            }

            if (isset($form_data['mf-captcha-challenge']) && isset($_SESSION['mf_captcha_text']) && ($form_data['mf-captcha-challenge'] == $_SESSION['mf_captcha_text'])) {
                $this->response->status = 1;
                //$this->response->data['captcha'] = esc_html__('Captcha is verified.', 'metform');
            } else {
                $this->response->status = 0;
                $this->response->error = [ esc_html__('Enter correct captcha.', 'metform') ];
                return $this->response;
            }
        }

        // user login check and action
        $required_loggin = isset($this->form_settings['require_login']) ? ((int) ($this->form_settings['require_login'])) : 0;

        if (($required_loggin == 1) && (!is_user_logged_in())) {
            $this->response->status = 0;
            $this->response->error = [ esc_html__('You must be logged in to submit form.', 'metform') ];
            return $this->response;
        }

        // Total entry limit check and prevent
        if (isset($this->form_settings['limit_total_entries_status'])) {
            $entry_limit = ((int) ($this->form_settings['limit_total_entries_status']));

            if (($entry_limit == 1) && ($this->get_entry_count() >= $this->form_settings['limit_total_entries'])) {
                $this->response->status = 0;
                $this->response->error = [ esc_html__('Form submission limit exceeded.', 'metform') ];

                return $this->response;
            }
        }

        // signature input upload as image from base64
        if (class_exists('\MetForm_Pro\Base\Package') && isset($form_data['mf-signature'])) {

            $signature_input = $this->get_input_name_by_widget_type('mf-signature');
            $this->response->data['signature_name'] = $signature_input;
            $this->response->data['signature_input_data'] = $form_data['mf-signature'];

            if ($signature_input != null) {
                $inputs = (is_array($signature_input) ? $signature_input : []);
                foreach ($inputs as $input) {
                    $b64string = isset($form_data[$input]) ? $form_data[$input] : '';
                    $status = $this->covert_base64_to_png($input, $b64string);
                    $form_data[$input] = (isset($status['url']) ? $status['url'] : '');
                }
            }
            //$this->response->data['signature_input'] = $signature_input;
        }

         // file upload check and action
         $file_input_names = $this->get_input_name_by_widget_type('mf-file-upload');

         if ((!empty($file_data)) && ($file_input_names != null)) {
             $this->upload_file($file_data, $file_input_names);
         }

        /**
         * ==============================
         *          Mailster action
         * ==============================
         */

        if (class_exists('\MetForm_Pro\Core\Integrations\Email\Mailster\Mailster')) {

            if (isset($this->form_settings['mf_mailster']) && $this->form_settings['mf_mailster'] == '1') {
                $mailster = new \MetForm_Pro\Core\Integrations\Email\Mailster\Mailster();
                $mailster->action($form_id, $form_data, $this->form_settings);
            }
        }

        // mailchimp email store action
        if (class_exists('\MetForm\Core\Integrations\Mail_Chimp')) {
            if (isset($this->form_settings['mf_mail_chimp']) && $this->form_settings['mf_mail_chimp'] == '1' && $this->email_name != null && $form_data[$this->email_name] != '') {

                $mail_chimp = new \MetForm\Core\Integrations\Mail_Chimp();

                if (array_key_exists("mf-listing-optin", $this->fields) && isset($form_data['mf-listing-optin'])) {
                    $response = $mail_chimp->call_api($form_data, ['auth' => $this->form_settings, 'email_name' => $this->email_name]);
                } elseif (!array_key_exists('mf-listing-optin', $this->fields)) {
                    $response = $mail_chimp->call_api($form_data, ['auth' => $this->form_settings, 'email_name' => $this->email_name]);
                }

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your mailchimp integration.', 'metform') ];

            }
        }

        // ActiveCampaign email store action

        if (class_exists('MetForm_Pro\Core\Integrations\Email\Activecampaign\Active_Campaign')) {
            if (isset($this->form_settings['mf_active_campaign']) && $this->form_settings['mf_active_campaign'] == '1' && $this->email_name != null && $form_data[$this->email_name] != '') {

                $active_campaign = new \MetForm_Pro\Core\Integrations\Email\Activecampaign\Active_Campaign();

                $response = $active_campaign->call_api($form_data, ['auth' => $this->form_settings, 'email_name' => $this->email_name]);

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
                $this->response->active_campaign = isset($response['msgs']) ? $response['msgs'] : [];
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your activeCampaign integration.', 'metform') ];
            }
        }

        // GetResponse email store action

        if (class_exists('\MetForm_Pro\Core\Integrations\Email\Getresponse\Get_Response')) {

            if (isset($this->form_settings['mf_get_response']) && $this->form_settings['mf_get_response'] == '1' && $this->email_name != null && $form_data[$this->email_name] != '') {

                $get_response = new \MetForm_Pro\Core\Integrations\Email\Getresponse\Get_Response();

                $response = $get_response->call_api($form_data, ['auth' => $this->form_settings, 'email_name' => $this->email_name]);

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your GetResponse integration.', 'metform') ];
            }
        }

        // data submit to zapier action and check
        if (class_exists('\MetForm_Pro\Core\Integrations\Zapier')) {
            if (isset($this->form_settings['mf_zapier']) && $this->form_settings['mf_zapier'] == '1') {

                $url = $this->form_settings['mf_zapier_webhook'];

                if (array_key_exists('mf-listing-optin', $this->fields) && isset($form_data['mf-listing-optin'])) {

                    $zapier = new \MetForm_Pro\Core\Integrations\Zapier();
                    $response = $zapier->call_webhook($form_data, ['url' => $url, 'email_name' => $this->email_name]);
                } elseif (!array_key_exists('mf-listing-optin', $this->fields)) {

                    $zapier = new \MetForm_Pro\Core\Integrations\Zapier();
                    $response = $zapier->call_webhook($form_data, ['url' => $url, 'email_name' => $this->email_name]);
                }

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your zapier integration.', 'metform') ];
            }
        }

        // data submit to slack check and action
        if (class_exists('\MetForm\Core\Integrations\Slack')) {
            if (isset($this->form_settings['mf_slack']) && $this->form_settings['mf_slack'] == '1' && $this->email_name != null && $form_data[$this->email_name] != '') {

                $url = $this->form_settings['mf_slack_webhook'];

                //$this->response->data['slack_hook'] = $url;

                if (array_key_exists('mf-listing-optin', $this->fields) && isset($form_data['mf-listing-optin'])) {

                    $slack = new \MetForm\Core\Integrations\Slack();
                    $response = $slack->call_webhook($form_data, ['url' => $url, 'email_name' => $this->email_name]);
                } elseif (!array_key_exists('mf-listing-optin', $this->fields)) {

                    $slack = new \MetForm\Core\Integrations\Slack();
                    $response = $slack->call_webhook($form_data, ['url' => $url, 'email_name' => $this->email_name]);
                }

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your slack integration.', 'metform') ];
            }
        }

        /**
         * Checking if convertKit is exists
         * If exists calling the api
         */
        if (class_exists('\MetForm_Pro\Core\Integrations\Convert_Kit')) {
            if (isset($this->form_settings['mf_convert_kit']) && $this->form_settings['mf_convert_kit'] == '1' && $this->email_name != null && $form_data[$this->email_name] != '') {

                $cKit = new \MetForm_Pro\Core\Integrations\Convert_Kit(false);

                $response = $cKit->call_api($form_data, ['mail_settings' => $this->form_settings, 'email_name' => $this->email_name]);

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with convertKit.', 'metform') ];
            }
        }

        /*
         * Aweber integration
         *
         */
        if (class_exists('\MetForm_Pro\Core\Integrations\Aweber')) {
            if (isset($this->form_settings['mf_mail_aweber']) && $this->form_settings['mf_mail_aweber'] == '1' && $this->email_name != null && $form_data[$this->email_name] != '') {

                $aweber = new \MetForm_Pro\Core\Integrations\Aweber(false);

                $response = $aweber->call_api($form_data, ['mail_settings' => $this->form_settings, 'email_name' => $this->email_name]);

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your Aweber integration.', 'metform') ];
            }
        }



        if (defined('MAILPOET_VERSION') && class_exists('\MetForm_Pro\Core\Integrations\Mail_Poet')) {
            if (isset($this->form_settings['mf_mail_poet']) && $this->form_settings['mf_mail_poet'] == '1' && $this->email_name != null && $form_data[$this->email_name] != '') {

                $mPoet = new \MetForm_Pro\Core\Integrations\Mail_Poet(false);

                $response = $mPoet->call_api($form_data, ['mail_settings' => $this->form_settings, 'email_name' => $this->email_name]);

                $this->response->status = isset($response['status']) ? $response['status'] : 0;
	            if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your Mail Poet integration.', 'metform') ];
            }
        }

        /**
         * MailerLite subscriber integration
         */
        if (class_exists('\MetForm_Pro\Core\Integrations\Mailerlite')) {
            if (
                isset($this->form_settings['mf_mailerlite']) && $this->form_settings['mf_mailerlite'] == '1'
                && $this->email_name != null
                && !empty($form_data[$this->email_name])
            ) {
                $ml_api_key = isset($this->form_settings['mf_mailerlite_api_key']) ? $this->form_settings['mf_mailerlite_api_key'] : '';

                if (!empty($ml_api_key)) {
                    $mailerlite = new \MetForm_Pro\Core\Integrations\Mailerlite($ml_api_key);
                    $ml_response = $mailerlite->process_form_submission(
                        $form_id,
                        $form_data,
                        $form_data[$this->email_name]
                    );

                    $this->response->status = isset($ml_response['status']) ? $ml_response['status'] : 0;
                    if ($this->response->status == 0) {
                        $this->response->error = [
                            esc_html__('Problem with your MailerLite integration.', 'metform')
                            . (!empty($ml_response['message']) ? ' ' . $ml_response['message'] : '')
                        ];
                    }
                }
            }
        }

        if (class_exists('Metform_Pro\Core\Integrations\Fluent_Crm')) {
            if (isset($this->form_settings['mf_fluent']) && $this->form_settings['mf_fluent'] == '1' && $this->email_name != null && !empty($form_data[$this->email_name])) {

                \Metform_Pro\Core\Integrations\Fluent_Crm::send_data($this->form_settings['mf_fluent_webhook'], $form_data, $this->email_name);
            }
        }

        // sanitize form submitted data
        $this->sanitize($form_data);

        //set submitted data array and key to a class
        $all_data = !empty($this->form_data) && is_array($this->form_data) ? $this->form_data : [];

        // Get payment method to determine if we need payment-first flow
        $payment_method_check = $this->get_input_name_by_widget_type('mf-payment-method');
        $selected_payment_method = null;
        
        // Only process payment logic if payment method widget exists
        if (!empty($payment_method_check)) {
            // Check if this is a payment-first request (get payment config without storing entries)
            $is_payment_first = isset($form_data['mf_payment_first']) && $form_data['mf_payment_first'] == '1';
            $is_payment_completed = isset($form_data['mf_payment_completed']) && $form_data['mf_payment_completed'] == '1';
            
            if (isset($payment_method_check[0]) && isset($this->form_data[$payment_method_check[0]])) {
                $selected_payment_method = $this->form_data[$payment_method_check[0]];
            }
        }
        
        $is_payment_first = isset($form_data['mf_payment_first']) && $form_data['mf_payment_first'] == '1';
        $is_payment_completed = isset($form_data['mf_payment_completed']) && $form_data['mf_payment_completed'] == '1';
        $payment_assistant_active = \Metform\Utils\Util::is_plugin_active('metform-payment-assistant/metform-payment-assistant.php');

        // If payment-first request for Stripe or PayPal and the payment assistant is active
        if ($payment_assistant_active && $is_payment_first && ($selected_payment_method === 'stripe' || $selected_payment_method === 'paypal')) {
            // Safety check: Ensure form settings exist
            if (empty($this->form_settings)) {
                $this->response->status = 0;
                $this->response->error[0] = esc_html__('Form settings not found. Please check form configuration.', 'metform');
                return $this->response;
            }
            
            // Create temporary entry to get entry_id for payment processing
            // Using 'auto-draft' status so it won't show in entries list at all
            $defaults = [
                'post_title' => '',
                'post_status' => 'auto-draft',
                'post_content' => '',
                'post_type' => $this->post_type,
            ];

            $this->entry_id = wp_insert_post($defaults);

            if (!is_wp_error($this->entry_id) && $this->entry_id) {
                update_post_meta($this->entry_id, $this->key_payment_status, 'unpaid');
                update_post_meta($this->entry_id, $this->key_form_id, $this->form_id);
                update_post_meta($this->entry_id, 'mf_page_id', $page_id);
                update_post_meta($this->entry_id, 'mf_payment_pending', '1'); // Flag to hide from entries
                
                // Store form data temporarily for PayPal
                update_post_meta($this->entry_id, 'mf_temp_form_data', $this->form_data);
            }

            $this->response->status = 1;
            $this->response->store_entries = '0';
            $this->response->data['entry_id'] = $this->entry_id;
            $this->response->data['message'] = isset($this->form_settings['success_message']) ? $this->form_settings['success_message'] : '';

            // Return Stripe payment configuration
            if ($selected_payment_method === 'stripe' && class_exists('\MetForm_Pro\Core\Integrations\Payment\Stripe')) {
                $payment_widget_name = $this->get_input_name_by_widget_type('mf-payment-method');
                $widget = is_array($payment_widget_name) ? current($payment_widget_name) : '';

                $amount_filed = isset($this->fields[$widget]->mf_input_payment_field_name) ? $this->fields[$widget]->mf_input_payment_field_name : '';
                $amount = isset($this->form_data[$amount_filed]) ? $this->form_data[$amount_filed] : 0;
                $currency = $this->form_settings['mf_payment_currency'] ?? 'USD';

                $icon_url = !empty($this->form_settings['mf_stripe_image_url']) ? $this->form_settings['mf_stripe_image_url'] : 'https://stripe.com/img/documentation/checkout/marketplace.png';

                $livekey = isset($this->form_settings['mf_stripe_live_publishiable_key']) ? $this->form_settings['mf_stripe_live_publishiable_key'] : '';
                $livekey_test = isset($this->form_settings['mf_stripe_test_publishiable_key']) ? $this->form_settings['mf_stripe_test_publishiable_key'] : '';
                $sandbox = isset($this->form_settings['mf_stripe_sandbox']) ? true : false;

                $live_keys = ($sandbox) ? $livekey_test : $livekey;

                $payment['name_post'] = $this->form_settings['form_title'];
                $payment['description'] = $this->form_id;
                $payment['amount'] = $amount;
                $payment['currency_code'] = $currency;
                $payment['keys'] = $live_keys;
                $payment['image_url'] = $icon_url;
                $payment['entry_id'] = $this->entry_id;
                $payment['form_id'] = $this->form_id;
                $payment['sandbox'] = $sandbox;

                $this->response->data['payment_data'] = (object) $payment;
                
                $rest_url = get_rest_url(null, 'metform/v1/entries/');
                $this->response->data['ajax_stripe'] = $rest_url . "stripe/pay?entry_id=" . $this->entry_id;
            }
            
            // Return PayPal redirect URL
            if ($selected_payment_method === 'paypal' && class_exists('\MetForm_Pro\Core\Integrations\Payment\Paypal')) {
                $rest_url = get_rest_url(null, 'metform/v1/entries/');
                $this->response->data['redirect_to'] = $rest_url . "paypal/pay?entry_id=" . $this->entry_id;
                $this->response->data['message'] = $this->form_settings['success_message'] . esc_html__(' Please wait... Redirecting to PayPal.', 'metform');
            }

            return $this->response;
        }

        if (isset($this->form_settings['store_entries']) && $this->form_settings['store_entries'] == 1) {

            $defaults = [
                'post_title' => '',
                'post_status' => 'draft',
                'post_content' => '',
                'post_type' => $this->post_type,
            ];

            if ($payment_assistant_active) {
                // Check if entry already exists (from payment-first flow)
                $existing_entry_id = isset($form_data['mf_entry_id']) ? intval($form_data['mf_entry_id']) : 0;
                
                // Only adopt a caller-supplied entry id if it is genuinely a
                // payment-pending temporary entry minted by this same payment-first
                // flow. Without this guard an attacker could pass the id of any
                // post/page and have store()/insert() overwrite it (IDOR + payment
                // state forgery). See mint logic ~ line 535-544.
                $is_valid_pending_entry = false;
                if ($existing_entry_id) {
                    $existing_post = get_post($existing_entry_id);
                    if (
                        $existing_post
                        && $existing_post->post_type === $this->post_type
                        && get_post_meta($existing_entry_id, 'mf_payment_pending', true) == '1'
                        && (int) get_post_meta($existing_entry_id, $this->key_form_id, true) === (int) $this->form_id
                    ) {
                        $is_valid_pending_entry = true;
                    }
                }

                // A supplied-but-invalid entry id is a tampering attempt: reject the
                // submission instead of silently overwriting or creating anything.
                if ($existing_entry_id && ! $is_valid_pending_entry) {
                    $this->response->status = 0;
                    $this->response->error[] = esc_html__('Unauthorized submission.', 'metform');
                    return $this->response;
                }

                if ($is_valid_pending_entry) {
                    // Update existing entry from payment-first flow
                    $this->entry_id = $existing_entry_id;
                    
                    // Change post status from 'auto-draft' to 'draft' to make it visible in entries
                    wp_update_post([
                        'ID' => $this->entry_id,
                        'post_status' => 'draft'
                    ]);
                    
                    // Remove the payment pending flag
                    delete_post_meta($this->entry_id, 'mf_payment_pending');
                    
                    // Get existing serial number
                    $entry_serial_no = get_post_meta($this->entry_id, 'metform_entries_serial_no', true);
                    if (!$entry_serial_no) {
                        $entry_serial_no = (int) get_option('metform_last_entry_serial_no', 0);
                        $entry_serial_no++;
                        update_option('metform_last_entry_serial_no', $entry_serial_no);
                        update_post_meta($this->entry_id, 'metform_entries_serial_no', $entry_serial_no);
                    }
                    $all_data = array_merge($all_data, ['mf_id' => $entry_serial_no, 'mf_form_name' => $this->title]);
                    
                    // Clean up temporary data
                    delete_post_meta($this->entry_id, 'mf_temp_form_data');
                } else {
                    $this->entry_id = wp_insert_post($defaults);

                    update_post_meta($this->entry_id, 'mf_page_id', $page_id);
                    $entry_serial_no = (int) get_option('metform_last_entry_serial_no', 0);
                    $all_data = array_merge($all_data, ['mf_id' => ++$entry_serial_no, 'mf_form_name' => $this->title]);
                    update_option('metform_last_entry_serial_no', $entry_serial_no);
                    update_post_meta($this->entry_id, 'metform_entries_serial_no', $entry_serial_no);
                }

                // If payment was completed via payment-first flow, mark payment status as paid
                if ($is_payment_completed && in_array($selected_payment_method, ['stripe', 'paypal'], true)) {
                    update_post_meta($this->entry_id, $this->key_payment_status, 'paid');
                }
            } else {
                $this->entry_id = wp_insert_post($defaults);

                update_post_meta($this->entry_id, 'mf_page_id', $page_id);
                $entry_serial_no = (int) get_option('metform_last_entry_serial_no', 0);
                $all_data = array_merge($all_data, ['mf_id' => ++$entry_serial_no, 'mf_form_name' => $this->title]);
                update_option('metform_last_entry_serial_no', $entry_serial_no);
                update_post_meta($this->entry_id, 'metform_entries_serial_no', $entry_serial_no);
            }
        }else{
            $this->response->status = '1';
            $this->response->store_entries = '0';
        }

        //For shortcode processing need hidden fields too 
        if ( $hidden_fields ) {
            foreach ( $hidden_fields as $value ) {
               $all_data[$value] = "";
            }
        }

        Metform_Shortcode::instance()->set_values($all_data);

        $attributes = [
            'email_field_name' => $this->email_name,
            'file_data' => $file_data,
            'file_upload_info' => $this->file_upload_info,
        ];

        do_action("metform_before_store_form_data", $form_id, $form_data, $this->form_settings, $attributes);

        $this->form_data = apply_filters("metform_filter_before_store_form_data", $this->form_data, $form_id , $this->form_settings, $attributes); 

        // Store data in database
        $this->store($form_id, $this->form_data);

        do_action("metform_after_store_form_data", $form_id, $form_data, $this->form_settings, $attributes);

        $this->response->data['redirect_to'] = !empty($this->form_settings['redirect_to']) ? $this->form_settings['redirect_to'] : '';

        // conditional redirect check and action (Pro feature — only runs when Pro is active)
        if ( class_exists( 'MetForm_Pro\Base\Package' ) ) {
            $conditional_redirect_url = $this->evaluate_conditional_redirect();
            if ( $conditional_redirect_url ) {
                $this->response->data['redirect_to'] = $conditional_redirect_url;
            }
        }

        $bypass_form_data = json_decode(get_post_meta($form_id, 'mf_redirect_params_status', true));
        
        if($bypass_form_data){

            $url_redirect_params = $this->get_redirect_url_params();
            if($url_redirect_params){
                $this->response->data['redirect_to'] = add_query_arg($url_redirect_params, $this->response->data['redirect_to']);
            }
            
        }


        // data submit to a rest api check and action
        if (class_exists('\MetForm_Pro\Core\Integrations\Rest_Api') && isset($this->form_settings['mf_rest_api']) && ($this->form_settings['mf_rest_api_url'] != '')) {
            $url = $this->form_settings['mf_rest_api_url'];
            $method = $this->form_settings['mf_rest_api_method'];
            $rest_api = new \MetForm_Pro\Core\Integrations\Rest_Api();
            $ref_url = isset($_SERVER['HTTP_REFERER']) ? sanitize_url($_SERVER['HTTP_REFERER']) : '';
            $response = $rest_api->call_api(
                [
                    'entries' => json_encode($this->form_data),
                    'entry_id' => (($this->entry_id != null) ? $this->entry_id : ''),
                    'form_id' => $form_data['id'],
                    'version' => \MetForm\Plugin::instance()->version(),
                    'file_uploads' => json_encode($this->file_upload_info),
                    'referrer_url' => $ref_url
                ],
                [
                    'url' => $url,
                    'method' => $method,
                ]
            );
            $this->response->status = isset($response['status']) ? $response['status'] : 0;

	        if($this->response->status == 0) $this->response->error = [ esc_html__('Problem with your RestApi integration.', 'metform') ];
        }

        // send confirmation email to user
        if (isset($this->form_settings['enable_user_notification']) && $this->form_settings['enable_user_notification'] == 1) {

            $this->send_user_email($this->form_data, $this->file_upload_info);
        }

        // send notification email to admins
        if (isset($this->form_settings['enable_admin_notification']) && $this->form_settings['enable_admin_notification'] == 1) {

            $this->send_admin_email($this->form_data, $this->file_upload_info);
        }

        $this->response->data['message'] = isset($this->form_settings['success_message']) ? $this->form_settings['success_message'] : '';

        $paymet_method = $this->get_input_name_by_widget_type('mf-payment-method');

        if (!$is_payment_completed && class_exists('\MetForm_Pro\Core\Integrations\Payment\Paypal') && isset($this->form_settings['mf_paypal']) && isset($this->form_settings['mf_paypal_email']) && ($this->form_settings['mf_paypal_email'] != '') && isset($paymet_method[0]) && ($paymet_method[0] != null)) {
            if (isset($this->form_data[$paymet_method[0]]) && $this->form_data[$paymet_method[0]] == 'paypal') {
                update_post_meta($this->entry_id, $this->key_payment_status, 'unpaid');
                $rest_url = get_rest_url(null, 'metform/v1/entries/');
                $this->response->data['redirect_to'] = $rest_url . "paypal/pay?entry_id=" . $this->entry_id;
                $this->response->data['message'] = $this->form_settings['success_message'] . esc_html__(' Please wait... Redirecting to paypal.', 'metform');
            }
        }

        if (!isset($paymet_method[0])) {
            $paymet_method[0] = null;
        }

        if (!$is_payment_completed && class_exists('\MetForm_Pro\Core\Integrations\Payment\Stripe') && ($paymet_method[0] != null)) {
            if (isset($this->form_data[$paymet_method[0]]) && $this->form_data[$paymet_method[0]] == 'stripe') {
                update_post_meta($this->entry_id, $this->key_payment_status, 'unpaid');

                $payment_widget_name = \MetForm\Core\Entries\Action::instance()->get_input_name_by_widget_type('mf-payment-method', $this->fields);
                $widget = is_array($payment_widget_name) ? current($payment_widget_name) : '';

                $amount_filed = isset($this->fields[$widget]->mf_input_payment_field_name) ? $this->fields[$widget]->mf_input_payment_field_name : '';
                $amount = isset($this->form_data[$amount_filed]) ? $this->form_data[$amount_filed] : 0;
                $currency = $this->form_settings['mf_payment_currency'] ?? 'USD';

                //$this->response->data['payment_method'] = $this->form_data[$paymet_method[0]];

                $icon_url = !empty($this->form_settings['mf_stripe_image_url']) ? $this->form_settings['mf_stripe_image_url'] : 'https://stripe.com/img/documentation/checkout/marketplace.png';

                // set key for check payment
                $livekey = isset($this->form_settings['mf_stripe_live_publishiable_key']) ? $this->form_settings['mf_stripe_live_publishiable_key'] : '';
                $livekey_test = isset($this->form_settings['mf_stripe_test_publishiable_key']) ? $this->form_settings['mf_stripe_test_publishiable_key'] : '';
                $sandbox = isset($this->form_settings['mf_stripe_sandbox']) ? true : false;

                $live_keys = ($sandbox) ? $livekey_test : $livekey;

                $payment['name_post'] = $this->form_settings['form_title'];
                $payment['description'] = $this->form_id;
                $payment['amount'] = $amount;
                $payment['currency_code'] = $currency;
                $payment['keys'] = $live_keys;
                $payment['image_url'] = $icon_url;
                $payment['entry_id'] = $this->entry_id;
                $payment['form_id'] = $this->form_id;
                $payment['sandbox'] = $sandbox;

                $this->response->data['payment_data'] = (object) $payment;
                $rest_url = get_rest_url(null, 'metform/v1/entries/');
                $this->response->data['ajax_stripe'] = $rest_url . "stripe/pay?entry_id=" . $this->entry_id;
                $this->response->data['message'] = $this->form_settings['success_message'] . esc_html__(' Please wait... Open a Stripe Popup Box.', 'metform');
            }
        }

        /**
         * Woocommerce
         */

        if (class_exists('WooCommerce')) {

            if ( isset($_POST['mf-woo-checkout']) && $_POST['mf-woo-checkout'] == 'yes' &&  class_exists('\MetForm_Pro\Core\Integrations\Ecommerce\Woocommerce\Pay')) {

                $woo_pay = new \MetForm_Pro\Core\Integrations\Ecommerce\Woocommerce\Pay();
                $woo_pay->action($form_data, $this->entry_id);
            }

        }

        /**
         * Post submission
         */

        if (class_exists('\MetForm_Pro\Core\Integrations\Post\Form_To_Post\Post')) {
            if (isset($this->form_settings['mf_form_to_post']) && $this->form_settings['mf_form_to_post'] == 1) {
                $post_submission = new \MetForm_Pro\Core\Integrations\Post\Form_To_Post\Post();
                $post_submission->create_post(
                    $form_data,
                    $this->form_settings,
                    $this->form_id,
                    $this->entry_id,
                    $this->file_upload_info
                );
            }
        }
        if(!empty($this->entry_id) && !empty($this->form_data[$this->email_name])) {
            if(!empty($this->form_settings['email_verification_enable']) && $this->form_settings['email_verification_enable'] == 1) {
                do_action('met_form_email_verification', $this->entry_id, $this->form_data[$this->email_name], $this->form_settings);
            }
        }

        return $this->response;
    }

    public function validate_form_data($form_data) {

        $field_count = 0;
        $errors = 0;

        $hidden_fields = isset($form_data['hidden-fields']) ? json_decode($form_data['hidden-fields'], true) : [];

        foreach ($form_data as $key => $value) {

            if (in_array($key, $hidden_fields)) {                
                continue;
            }
            
            if (!is_array($value)) {

                $is_required = isset($this->fields[$key]->mf_input_required) && $this->fields[$key]->mf_input_required == "yes";
              
                if(!$is_required && trim($value) == '') {
                   continue;
                }

                $field_count++;
                $min = ((isset($this->fields[$key]->mf_input_min_length) && $this->fields[$key]->mf_input_min_length != '') ? $this->fields[$key]->mf_input_min_length : '');
                $max = ((isset($this->fields[$key]->mf_input_max_length) && $this->fields[$key]->mf_input_max_length != '') ? $this->fields[$key]->mf_input_max_length : '');
                $validation_type = ((isset($this->fields[$key]->mf_input_validation_type) && $this->fields[$key]->mf_input_validation_type != '') ? $this->fields[$key]->mf_input_validation_type : 'none');
                $expression = ((isset($this->fields[$key]->mf_input_validation_expression) && $this->fields[$key]->mf_input_validation_expression != '') ? $this->fields[$key]->mf_input_validation_expression : '');
                $type = str_replace(['by_', '_length'], '', $validation_type);
                $str_length = '';

                if ($validation_type == 'by_word_length') {
                    $str_length = str_word_count($value);
                } else if ($validation_type == 'by_character_length') {
                    $str_length =  strlen($value);
                    if ($this->fields[$key]->widgetType === 'mf-number') {
                        $str_length =  $value;
                    }
                }

                if ((!in_array($validation_type, ['none', 'by_expresssion_based'])) && ($min != '') && ($min > $str_length)) {
                    $errors++;
                    $this->response->status = 0;
                    $this->response->error[] = esc_html((($this->fields[$key]->mf_input_label != '') ? $this->fields[$key]->mf_input_label : $key) . " minimum input " . $min . " " . $type);
                }
                if ((!in_array($validation_type, ['none', 'by_expresssion_based'])) && ($max != '') && ($max < $str_length)) {
                    $errors++;
                    $this->response->status = 0;
                    $this->response->error[] = esc_html((($this->fields[$key]->mf_input_label != '') ? $this->fields[$key]->mf_input_label : $key) . " maximum input " . $max . " " . $type);
                }
                if (($validation_type == 'by_expresssion_based') && ($expression != '') && (!preg_match("/" . $expression . "/", $value))) {
                    $errors++;
                    $this->response->status = 0;
                    $this->response->error[] = esc_html((($this->fields[$key]->mf_input_label != '') ? $this->fields[$key]->mf_input_label : $key) . " input criteria is not matched.");
                }
                if($validation_type == 'by_range'){

                    $min = ((isset($this->fields[$key]->mf_input_min_value) && $this->fields[$key]->mf_input_min_value != '') ? $this->fields[$key]->mf_input_min_value : '');
                    $max = ((isset($this->fields[$key]->mf_input_max_value) && $this->fields[$key]->mf_input_max_value != '') ? $this->fields[$key]->mf_input_max_value : '');
                    if (($min != '') && ($min > intval(trim($value)))) {
                        $errors++;
                        $this->response->status = 0;
                        $this->response->error[] = esc_html((($this->fields[$key]->mf_input_label != '') ? $this->fields[$key]->mf_input_label : $key) . " minimum input " . $min . " " . $type);
                    }
                    if (($max != '') && ($max < intval(trim($value)))) {
                        $errors++;
                        $this->response->status = 0;
                        $this->response->error[] = esc_html((($this->fields[$key]->mf_input_label != '') ? $this->fields[$key]->mf_input_label : $key) . " maximum input " . $max . " " . $type);
                    }
                }
            }
        }

        return (($errors > 0) ? false : true);
    }

    public function store($form_id, $form_data) {
        $this->form_id = $form_id;
        //$this->sanitize($form_data);

        if (isset($this->form_settings['store_entries']) && $this->form_settings['store_entries'] == 1) {
            $this->insert();
        }
    }

    private function insert() {
        // google sheet
        if(class_exists('\MetForm_Pro\Core\Integrations\Google_Sheet\WF_Google_Sheet')) {
            if(isset($this->form_settings['mf_google_sheet']) && $this->form_settings['mf_google_sheet'] == 1) {
                
                $sheetdata = null;

                if(isset($this->form_settings['mf_google_spreadsheets_list_id']) && isset($this->form_settings['mf_google_sheets_list_id'])){
                    $sheetdata = [
                        "sheet_id"       => $this->form_settings['mf_google_spreadsheets_list_id'],
                        "sheet_title_no" => $this->form_settings['mf_google_sheets_list_id'],
                    ];
                }

                $sheet = \MetForm_Pro\Core\Integrations\Google_Sheet\WF_Google_Sheet::instance()->insert($this->form_id, $this->title, $this->form_data, $this->file_upload_info, $this->get_fields($this->form_id), $sheetdata );
                if($sheet === false) {
                    $this->response->error[] = esc_html__('ssl certificate or google oauth credentials problem', 'metform');
                    $this->response->status = 0;
                    return $this->response;
                }

            }
        }
        
        // google drive
        if(class_exists('\MetForm_Pro\Core\Integrations\Google_Drive\MF_Google_Drive')) {            
            if(isset($this->form_settings['mf_google_drive']) && $this->form_settings['mf_google_drive'] == 1) {
                $google_drive_folder_list_id = isset($this->form_settings['mf_google_drive_folder_list_id']) ? 
                    ["folder_id" => $this->form_settings['mf_google_drive_folder_list_id']] : null;
                
                // Filter file_upload_info to only include mf-file-upload widget data
                $filtered_file_upload_info = isset($this->file_upload_info['mf-file-upload']) ? 
                    ['mf-file-upload' => $this->file_upload_info['mf-file-upload']] : [];
                
                    // Proceed only if there are files from mf-file-upload widget
                    if (!empty($filtered_file_upload_info) && !empty($google_drive_folder_list_id)) {
                    $drive = \MetForm_Pro\Core\Integrations\Google_Drive\MF_Google_Drive::instance()->insert_file(
                        $this->form_id, 
                        $this->title, 
                        $this->form_data, 
                        $filtered_file_upload_info, 
                        $this->get_fields($this->form_id), 
                        $google_drive_folder_list_id
                    );
                    
                    if ($drive === false) {
                        $this->response->error[] = esc_html__('Google Drive upload failed: SSL certificate or OAuth credentials problem', 'metform');
                        $this->response->status = 0;
                        return $this->response;
                    }
                }
            }
        }

        // dropbox file upload
        if (class_exists('\MetForm_Pro\Core\Integrations\Dropbox\MF_Dropbox')) {
            if (isset($this->form_settings['mf_dropbox']) && $this->form_settings['mf_dropbox'] == '1') {
                
                $dropbox_folder_path = isset($this->form_settings['mf_dropbox_list_id']) ? $this->form_settings['mf_dropbox_list_id'] : '';
                
                // Only process files from mf-file-upload widget
                if (!empty($dropbox_folder_path) && isset($this->file_upload_info['mf-file-upload']) && is_array($this->file_upload_info['mf-file-upload'])) {
                    $dropbox = \MetForm_Pro\Core\Integrations\Dropbox\MF_Dropbox::instance();
                    
                    // Process each uploaded file from mf-file-upload widget
                    foreach ($this->file_upload_info['mf-file-upload'] as $file) {
                        if (!is_array($file)) {
                            continue;
                        }
                        
                        // Check for 'file' key (actual structure) or 'file_path' key (legacy)
                        $file_path = isset($file['file']) ? $file['file'] : (isset($file['file_path']) ? $file['file_path'] : '');
                        
                        if (!empty($file_path) && file_exists($file_path)) {
                            // Use 'name' key from file array, fallback to basename
                            $file_name = isset($file['name']) ? $file['name'] : basename($file_path);
                            $upload_result = $dropbox->upload_file(
                                $file_path,
                                $dropbox_folder_path,
                                $file_name
                            );
                        }
                    }
                }
            }
        }
        
        $form_settings = $this->form_settings;
        $form_id = $this->form_id;

        if (class_exists('\MetForm_Pro\Core\Integrations\Sms\Sms')) {
            if (isset($form_settings['mf_sms_status']) && $form_settings['mf_sms_status'] == 1) {

                if (isset($form_settings['mf_sms_user_status']) && $form_settings['mf_sms_user_status'] == 1) {

                    $mobile_number = $this->get_input_name_by_widget_type('mf-mobile');

                    if (isset($mobile_number[0])) {
                        $message = isset($form_settings['mf_sms_user_body']) ? $form_settings['mf_sms_user_body'] : '';
                        \MetForm_Pro\Core\Integrations\Sms\Sms::send_sms('twilio', $form_settings, $this->form_data[$mobile_number[0]], $message);
                    }
                }

                if (isset($form_settings['mf_sms_admin_status']) && $form_settings['mf_sms_admin_status'] == 1 && isset($form_settings['mf_sms_admin_to'])) {

                    $message = isset($form_settings['mf_sms_admin_body']) ? $form_settings['mf_sms_admin_body'] : '';
                    \MetForm_Pro\Core\Integrations\Sms\Sms::send_sms('twilio', $form_settings, $form_settings['mf_sms_admin_to'], $message);
                }
            }
        }

        $this->form_settings['entry_title'] = (!empty($this->form_settings['entry_title']) ? $this->form_settings['entry_title'] : 'Entry # [mf_id]');

        $update = array(
            'ID' => $this->entry_id,
            'post_title' => Metform_Shortcode::instance()->get_process_shortcode($this->form_settings['entry_title']),
            'post_status' => 'publish',
            'post_content' => '',
        );

        wp_update_post($update);

        $this->response->data['form_id'] = $form_id;
        $this->response->data['entry_id'] = $this->entry_id;

        $entry_count = $this->get_entry_count();
        $entry_count++;

        update_post_meta($form_id, $this->key_form_total_entries, $entry_count);
        update_post_meta($this->entry_id, $this->key_form_id, $form_id);
        update_post_meta($this->entry_id, $this->key_form_data, $this->form_data);

        update_post_meta($this->entry_id, $this->key_form_file, $this->file_upload_info);

        if (isset($form_settings['capture_user_browser_data']) && $form_settings['capture_user_browser_data'] == '1') {
            update_post_meta($this->entry_id, $this->key_browser_data, $this->get_browser_data());
            $this->response->status = 1;
        }

        // entries of logged in user data  
        if (is_user_logged_in()) {
           update_post_meta($this->entry_id, 'metform_entries__user_id', get_current_user_id());
        }

        $this->response->status = 1;
        $this->response->data['store'] = $this->form_data;
        //## set stransient token for data access checking 
        set_transient('transient_mf_form_data_entry_id_'.$this->entry_id, $this->entry_id, 15*60);
        
       // Generate a cryptographically secure random token
        $mf_secure_token = wp_generate_password(32, false);
        // Store the hashed token in a transient keyed by entry ID
        $mf_token_hash = hash('sha256', $mf_secure_token);
        set_transient('transient_mf_token_hash_'.$this->entry_id, $mf_token_hash, 15*60);
        
        // Set the raw token as an HttpOnly, Secure, SameSite cookie
        $cookie_options = array(
            'expires' => time() + (60 * 15),
            'path' => '/',
            'domain' => '',
            'secure' => is_ssl(),
            'httponly' => true,
            'samesite' => 'Strict'
        );
        setcookie(base64_encode('mf-cookie'), $mf_secure_token, $cookie_options);
    }

    private function update()
    {

        update_post_meta($this->entry_id, $this->key_form_id, $this->form_id);
        update_post_meta($this->entry_id, $this->key_form_data, $this->form_data);

        $this->response->status = 1;
    }

    public function send_user_email($form_data, $file_info)
    {
        
        // get user mail from form data
        $user_mail = null;
        $all_email_names = $this->get_input_name_by_widget_type('mf-email') ?? [];
        foreach ($all_email_names as $_email_key) {
            if (!empty($form_data[$_email_key])) {
                $user_mail = $form_data[$_email_key];
                break;
            }
        }
        $subject = isset($this->form_settings['user_email_subject']) ? $this->form_settings['user_email_subject'] : get_bloginfo('name');
        $from = isset($this->form_settings['user_email_from']) ? $this->form_settings['user_email_from'] : null;
        $reply_to = isset($this->form_settings['user_email_reply_to']) ? $this->form_settings['user_email_reply_to'] : null;
        $body = nl2br(isset($this->form_settings['user_email_body']) ? $this->form_settings['user_email_body'] : null);
        $user_email_attached_submission_copy = isset($this->form_settings['user_email_attach_submission_copy']) ? $this->form_settings['user_email_attach_submission_copy'] : null;

        //replace data from shortcode
        $body = Metform_Shortcode::instance()->get_process_shortcode($body);
        $reply_to = Metform_Shortcode::instance()->get_process_shortcode($reply_to);
        $subject = Metform_Shortcode::instance()->get_process_shortcode($subject);

        if($user_email_attached_submission_copy == "1"){
            $body = "<html><body><h2 style='text-align: center;'>" . get_the_title($this->form_id) . "</h2><h4 style='text-align: center;'>" . $body . "</h4>";
            $form_html = \MetForm\Core\Entries\Form_Data::format_data_for_mail($this->form_id, $form_data, $file_info);
            $body .= $form_html . "</body></html>";
        }else{
            $body = "<html><body><h2 style='text-align: center;'>" . get_the_title($this->form_id) . "</h2><h4 style='text-align: center;'>" . $body . "</h4>" . "</body></html>";
        }

        // body will be in the filter hook 

        $body = apply_filters('metform_confirmation_user_email_body', $body, $this->form_id, $form_data, $file_info, $this->form_settings);

        $headers = 'MIME-Version: 1.0' . "\r\n";
        $headers .= 'Content-type: text/html; charset=UTF-8' . "\r\n";

        $headers .= 'From: ' . $from . "\r\n" .
            'Reply-To: ' . $reply_to . "\r\n" .
            'X-Mailer: PHP/' . phpversion();

        if (!$user_mail) {
		if(current_user_can( 'manage_options' )){
			$this->response->status = 0;
          	$this->response->error[] = esc_html__('Mail not found.', 'metform');
		}
        } else {
		$status = wp_mail($user_mail, $subject, $body, $headers);
		if(current_user_can( 'manage_options' )){
			if(empty($status)){
				$this->response->error[] = esc_html__('Please setup your SMTP mail server.', 'metform');
				$this->response->status = 0;
			}
		}
	  }
    }

    public function send_admin_email($form_data, $file_info)
    {

        $subject = isset($this->form_settings['admin_email_subject']) ? $this->form_settings['admin_email_subject'] : null;
        $from = isset($this->form_settings['admin_email_from']) ? $this->form_settings['admin_email_from'] : null;
        $reply_to = isset($this->form_settings['admin_email_reply_to']) ? $this->form_settings['admin_email_reply_to'] : null;
        $body = nl2br(isset($this->form_settings['admin_email_body']) ? $this->form_settings['admin_email_body'] : null);
        $admin_email_attached_submision_copy = isset($this->form_settings['admin_email_attach_submission_copy']) ? $this->form_settings['admin_email_attach_submission_copy'] : null;

        //replace data from shortcode
        $body = Metform_Shortcode::instance()->get_process_shortcode($body);
        $from = Metform_Shortcode::instance()->get_process_shortcode($from);
        $reply_to = Metform_Shortcode::instance()->get_process_shortcode($reply_to);
        $subject = Metform_Shortcode::instance()->get_process_shortcode($subject);

        $body = "<html><body><h2 style='text-align: center;'>" . get_the_title($this->form_id) . "</h2><h4 style='text-align: center;'>" . $body . "</h4>";
        $form_html = \MetForm\Core\Entries\Form_Data::format_data_for_mail($this->form_id, $form_data, $file_info);
        $body .= $form_html;
        if (isset($this->form_settings['store_entries']) && $this->form_settings['store_entries'] == 1) {
            $edit_link = get_edit_post_link($this->entry_id);
            $body .= '<a href="' . $edit_link . '">' . $edit_link . '</a>';
        }
        $body .= "</body></html>";

        $headers = 'MIME-Version: 1.0' . "\r\n";
        $headers .= 'Content-type: text/html; charset=UTF-8' . "\r\n";

        $headers .= 'From: ' . $from . "\r\n" .
            'Reply-To: ' . $reply_to . "\r\n" .
            'X-Mailer: PHP/' . phpversion();

        $mail = isset($this->form_settings['admin_email_to']) ? $this->form_settings['admin_email_to'] : null;
        $mail = Metform_Shortcode::instance()->get_process_shortcode($mail); 
        if (!$mail) {
		if(current_user_can( 'manage_options' )){
			$this->response->status = 0;
          	$this->response->error[] = esc_html__('Admin mail not found to send email.', 'metform');
		}
        } else {
			$admin_email = preg_replace('/\s+/', '', $mail);
			$admin_emails = explode(",", $admin_email);
			foreach ($admin_emails as $email) {
				$status = wp_mail($email, $subject, $body, $headers);
			}
			if(current_user_can( 'manage_options' )){
				if(empty($status)){
					$this->response->error[] = esc_html__('Please setup your SMTP mail server.', 'metform');
					$this->response->status = 0;
				}
			}
		}
    }

    /**
     * Check if woocommerce is exists
     */
    public static function mf_is_woo_exists()
    {
        if (in_array('woocommerce/woocommerce.php', apply_filters('active_plugins', get_option('active_plugins')))) {
            return true;
        }
        return false;
    }

    public function get_fields($form_id = null)
    {
        if ($form_id != null) {
            $this->form_id = $form_id;
        }

        $input_widgets = \Metform\Widgets\Manifest::instance()->get_input_widgets();

        $widget_input_data = get_post_meta($this->form_id, '_elementor_data', true);
        $widget_input_data = json_decode($widget_input_data);

        return Map_El::data($widget_input_data, $input_widgets)->get_el();
    }

    public function sanitize($form_data, $fields = null)
    {
        if ($fields == null) {
            $fields = $this->fields;
        }

        foreach ($form_data as $key => $value) {

            if (isset($fields[$key])) {
                
                $this->form_data[$key] = $value;

                /**
                 * Credit card value sanitizaton & type insertion
                 */
                if ($fields[$key]->widgetType == "mf-credit-card" && !empty(trim($value))) {

                    $this->form_data[$key] = str_repeat('*', strlen(str_replace(' ', '', $value)) - 4) . substr(str_replace(' ', '', $value), -4);
                    $this->form_data[$key . '--type'] = $form_data[$key . '--type']; #insert credit card type
                }
            }



            // If it's quiz form
            if(isset($this->form_settings['form_type']) && $this->form_settings['form_type'] == 'quiz-form'){
                $quiz_data_keys = [
                    'wrong-answer',
                    'right-answer',
                    'quiz-marks',
				'total-question',
                ];

                if(in_array($key, $quiz_data_keys)){
                    // Sanitize quiz data based on the field type
                    if($key === 'quiz-marks' || $key === 'total-question'){
                        // These should be numeric values
                        $this->form_data[$key] = floatval($value);
                    } else {
                        // 'wrong-answer' and 'right-answer' are comma-separated field names
                        // Sanitize each field name in the list
                        $sanitized_values = array_map('sanitize_text_field', explode(',', $value));
                        $this->form_data[$key] = implode(',', array_filter($sanitized_values));
                    }
                }
            }
        }

        $repeaters = $this->get_input_name_by_widget_type('mf-simple-repeater');

        $repeaters = (is_array($repeaters) ? $repeaters : []);

        foreach ($repeaters as $repeater) {
            if (isset($this->form_data[$repeater])) {
                $repeater_process_data = $this->process_repeater_data($this->form_data[$repeater]);
                $this->form_data[$repeater] = $repeater_process_data;
            }
        }
    }

    public function upload_file($file_data, $file_input_names)
    {
        
        foreach ($file_input_names as $i => $input_name) {
            // initial upload status, status use as array for multiple file
            $upload[$input_name]['status'] = false;
            $this->handle_file($file_data, $input_name); 
        }
    }


    
    /**
     * Allow additional MIME types for wp_handle_upload().
     * WordPress does not include .iges / .igs in its default list,
     * so without this filter those files are rejected at the wp layer.
     */
    public function allow_extra_upload_mimes($mimes)
    {
        // finfo detects .iges/.igs, .stp/.step files as 'text/plain' (plain-text ISO formats).
        // The registered MIME must match the finfo result so wp_check_filetype_and_ext()
        // and wp_handle_upload() accept the file.
        $mimes['iges'] = 'text/plain';
        $mimes['igs']  = 'text/plain';
        $mimes['stp']  = 'text/plain';
        $mimes['step'] = 'text/plain';
        $mimes['heic']  = 'image/heic';
	    $mimes['heif']  = 'image/heif';
        return $mimes;
    }

    private function handle_file($file_data, $input_name)
    { 
         
        if (empty($file_data[$input_name])) {
            return;
        }
        if(!function_exists('wp_handle_upload')){
            // need to require WordPress wp_handle_upload function
            require_once ABSPATH . 'wp-admin/includes/file.php';
        }

        // Allow extra MIME types (e.g. .iges, .igs, .stp, .step) that WordPress does not permit by default. 
        add_filter('upload_mimes', [$this, 'allow_extra_upload_mimes']);

         
         // Filter to modify upload directory
         add_filter('upload_dir', [$this, 'modify_metform_upload_dir']);

        // remove_filter('upload_dir', [$this, 'modify_metform_upload_dir']);

        $files = $file_data[$input_name];
        $total_files = (isset($file_data[$input_name]['name']) && is_array($file_data[$input_name]['name'])) ? count($file_data[$input_name]['name']) : 0;
        $failed = false;
        $uploaded_info = [];

        for ($index = 0; $index < $total_files; $index++) {
            if (isset($files['name'][$index]) && $files['name'][$index] != '') {

                $file = [
                    'name' => "entry-file-".wp_hash(microtime(), 'secure_auth').'.'.pathinfo($files['name'][$index], PATHINFO_EXTENSION), 
                    'type' => $files['type'][$index],
                    'tmp_name' => $files['tmp_name'][$index],
                    'error' => isset($files['error'][$index]) ? $files['error'][$index] : null,
                    'size' => $files['size'][$index],
                ];


                $upload = \wp_handle_upload($file, array('test_form' => false));

                if (isset($upload['error']) && $upload['error']) {
                    $failed = true;
                    break;
                } else {
                    $uploaded_info[] = [
                        'name' => $files['name'][$index],
                        'url' => $upload['url'],
                        'file' => $upload['file'],
                        'type' => $files['type'][$index],
                    ];
                }
            }
        }

        if ($failed) {
            $this->response->status = 0;
            $this->response->error[] = esc_html__('There was an error uploading your file.', 'metform');
        } else {
            $this->file_upload_info[$input_name] = $uploaded_info;
            $this->response->status = 1;
        } 
    }
    
    /**
     * Modify default upload directory for upload metform entires
     */

    public function modify_metform_upload_dir($upload_dir) {
        $custom_upload_folder = 'metform-uploads';
    
        // Initialize WordPress filesystem
        global $wp_filesystem;
        if (empty($wp_filesystem)) {
            require_once ABSPATH . '/wp-admin/includes/file.php';
            WP_Filesystem();
        }
    
        // Setup paths
        $upload_path = $upload_dir['basedir'] . '/' . $custom_upload_folder;
        $upload_url = $upload_dir['baseurl'] . '/' . $custom_upload_folder;
    
        $upload_dir['path'] = $upload_path;
        $upload_dir['url'] = $upload_url;
        $upload_dir['subdir'] = '/' . $custom_upload_folder;
    
        // Create directory if it doesn't exist
        if (!$wp_filesystem->is_dir($upload_path)) {
            $wp_filesystem->mkdir($upload_path);
        }
    
        // Create index.php file for folder protection
        $index_file = $upload_path . '/index.php';
        if (!$wp_filesystem->exists($index_file)) {
            $wp_filesystem->put_contents($index_file, '<?php // Silence is golden.');
        }
    
        // Create .htaccess file for additional security rules
        $htaccess_file = $upload_path . '/.htaccess';
        if (!$wp_filesystem->exists($htaccess_file)) {
            $rules = '# Disable parsing of PHP for some server configurations to modify rules use metform_upload_root_htaccess_rules filter hook.
    <Files *>
        SetHandler none
        SetHandler default-handler
        Options -ExecCGI
        Options -Indexes
        RemoveHandler .cgi .php .php3 .php4 .php5 .phtml .pl .py .pyc .pyo
    </Files>
    <IfModule mod_php5.c>
        php_flag engine off
    </IfModule>
    <IfModule headers_module>
        Header set X-Robots-Tag "noindex"
    </IfModule>';
    
         /**
		 * A filter to allow the htaccess rules
		 *
		 * @since 3.8.7
		 *
		 * @param mixed $rules The Rules of what to parse or not to parse
		 */
		$rules = apply_filters( 'metform_upload_root_htaccess_rules', $rules );
		if ( ! empty( $rules ) ) {
            if(!function_exists('insert_with_markers')){
				require_once( ABSPATH . 'wp-admin/includes/misc.php' );
			}
			insert_with_markers( $htaccess_file, 'MetForm', $rules );
		}
        }
    
        return $upload_dir;
    }
    
    private function get_redirect_url_params(){

        $url_data = [];

        // get current form redirect url params 
        $redireact_params = get_post_meta($this->form_id, 'mf_redirect_params', true);

        if(trim($redireact_params)){
            $redireact_params = json_decode($redireact_params, true);
            if(is_array($redireact_params)){

                foreach($redireact_params as $r_key => $r_params){ 
                    foreach($this->form_data as $d_key => $f_data){
                    
                        // check for key match
                        if(trim($r_params) == trim($d_key)){
                                $url_data[$r_key] = $f_data;
                        }
                    }
                }
                return $url_data;
            }
        }
        return false;
    }

    /**
     * Evaluate conditional redirect rules and return the redirect URL if conditions are met.
     *
     * @return string|false The redirect URL if conditions are met, or false if not.
    */

    private function evaluate_conditional_redirect() {
        $status = get_post_meta( $this->form_id, 'mf_conditional_redirect_status', true );

        if ( $status !== 'true' ) {
            return false;
        }

        $rules_json = get_post_meta( $this->form_id, 'mf_conditional_redirect_rules', true );

        if ( empty( $rules_json ) ) {
            return false;
        }

        $rules = json_decode( $rules_json, true );

        if ( ! is_array( $rules ) ) {
            return false;
        }

        foreach ( $rules as $rule ) {
            if ( ! is_array( $rule ) ) {
                continue;
            }

            $redirect_url = $rule['redirect_url'] ?? '';
            $conditions   = $rule['conditions']   ?? [];

            if ( empty( $redirect_url ) || ! is_array( $conditions ) || empty( $conditions ) ) {
                continue;
            }

            $logic  = $rule['logic'] ?? 'AND';
            $result = ( $logic === 'OR' ) ? false : true;

            foreach ( $conditions as $condition ) {
                $field_name  = $condition['field']   ?? '';
                $compare     = $condition['compare'] ?? '==';
                $check_value = $condition['value']   ?? '';
                $form_value  = $this->form_data[ $field_name ] ?? '';
                $cond_result = $this->mf_compare_values( $form_value, $compare, $check_value );

                if ( $logic === 'OR' ) {
                    $result = $result || $cond_result;
                } else {
                    $result = $result && $cond_result;
                }
            }

            if ( $result ) {
                return esc_url_raw( $redirect_url );
            }
        }

        return false;
    }

    private function mf_compare_values( $actual, $operator, $expected ) {
        switch ( $operator ) {
            case '==':  return (string) $actual === (string) $expected;
            case '!=':  return (string) $actual !== (string) $expected;
            case '>':   return is_numeric( $actual ) && is_numeric( $expected ) && (float) $actual >  (float) $expected;
            case '>=':  return is_numeric( $actual ) && is_numeric( $expected ) && (float) $actual >= (float) $expected;
            case '<':   return is_numeric( $actual ) && is_numeric( $expected ) && (float) $actual <  (float) $expected;
            case '<=':  return is_numeric( $actual ) && is_numeric( $expected ) && (float) $actual <= (float) $expected;
            default:    return false;
        }
    }

    /**
     * Converting an png image string to png image file.
     *
     * @param $input
     * @param $b64string
     *
     * @return array
     */
    public function covert_base64_to_png($input, $b64string)
    {
        $status = [];

        $upload_dir = wp_upload_dir();
        $upload_path = $upload_dir['path'];
        $upload_url = $upload_dir['url'];

        $bin = str_replace('data:image/png;base64,', '', $b64string, $ct);

        $decoded = base64_decode($bin);

        $img_name = '/' . $input . time() . '.png';

        $img_file = $upload_path . $img_name;
        $img_url = $upload_url . $img_name;

        $img = file_put_contents($img_file, $decoded);

        if ($img) {
            $status['status'] = true;
            $status['url'] = $img_url;
        } else {
            $status['status'] = false;
        }

        return $status;
    }

    public function get_entry_count($form_id = null)
    {

        if ($form_id != null) {
            $this->form_id = $form_id;
        }
        global $wpdb;

        $payment_assistant_active = \MetForm\Utils\Util::is_plugin_active('metform-payment-assistant/metform-payment-assistant.php');

        if ($payment_assistant_active) {
            // Exclude entries with 'auto-draft' status and entries with payment pending flag.
            // This ensures only completed entries (including those with completed payments) are counted.
            $entry_count = $wpdb->get_results($wpdb->prepare(
                "SELECT COUNT(DISTINCT pm.post_id) as `count` 
                FROM `" . $wpdb->prefix . "postmeta` pm
                INNER JOIN `" . $wpdb->prefix . "posts` p ON pm.post_id = p.ID
                LEFT JOIN `" . $wpdb->prefix . "postmeta` pm_pending ON pm.post_id = pm_pending.post_id AND pm_pending.meta_key = 'mf_payment_pending'
                WHERE pm.meta_key = %s 
                AND pm.meta_value = %d
                AND p.post_status != 'auto-draft'
                AND pm_pending.meta_value IS NULL",
                'metform_entries__form_id',
                $this->form_id
            ), OBJECT);
        } else {
            $entry_count = $wpdb->get_results($wpdb->prepare(
                " SELECT COUNT( `post_id` ) as `count`  FROM `" . $wpdb->prefix . "postmeta` WHERE `meta_key` LIKE %s AND `meta_value` = %d ",
                'metform_entries__form_id',
                $this->form_id
            ), OBJECT);
        }

        $entry_count = $entry_count[0]->count;

        $this->entry_count = $entry_count;

        return $entry_count;
    }

    public function get_browser_data()
    {

        if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
            $ip = sanitize_text_field(wp_unslash($_SERVER['HTTP_CLIENT_IP']));
        } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = sanitize_text_field(wp_unslash($_SERVER['HTTP_X_FORWARDED_FOR']));
        } else {
            $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])):'';
        }

        $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])):'';

        return [
            'IP' => $ip,
            'User_Agent' => $user_agent,
        ];
    }

    public function get_input_name_by_widget_type($widget_type, $fields = null)
    {
        global $w;
        if ($fields != null) {
            $this->fields = $fields;
        }
        $response = [];

        $w = $widget_type;
        $files = array_values(array_filter($this->fields, function ($v) {
            global $w;
            if ($v->widgetType == $w) {
                return $v;
            }
        }));
        foreach ($files as $file) {
            $response[] = $file->mf_input_name;
        }

        if (!empty($response)) {
            return $response;
        } else {
            return null;
        }
    }

    public function process_repeater_data($repeater_data)
    {
        $data = [];
        if (is_array($repeater_data)) {
            foreach ($repeater_data as $index => $value) {
                if (is_array($value)) {
                    foreach ($value as $input_name => $input_value) {
                        $proc_key = $input_name . "-" . ((int)$index + 1);
                        if (is_array($input_value)) {
                            $data[$proc_key] = implode(', ', $input_value);
                        } else {
                            $data[$proc_key] = $input_value;
                        }
                    }
                }
            }
        }

        return $data;
    }
}
