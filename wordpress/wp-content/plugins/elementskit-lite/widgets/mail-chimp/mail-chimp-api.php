<?php

namespace ElementsKit_Lite;

use \Elementor\ElementsKit_Widget_Mail_Chimp_Handler;

class ElementsKit_Widget_Mail_Chimp_Api extends Core\Handler_Api {

	public function config(){
        $this->prefix = 'widget/mailchimp';
    }

    public function get_sendmail(){
		// Get only the GET parameters
        $params = isset($this->request['GET']) ? $this->request['GET'] : $this->request->get_params();


		$return = ['success' => [], 'error' => [] ];

		$nonce = $this->request->get_header( 'X-WP-Nonce' );
		if ( empty( $nonce ) || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			$return['error'] = esc_html__( 'Security check failed. Please refresh the page and try again.', 'elementskit-lite' );
			return $return;
		}

		$dataApi 	= ElementsKit_Widget_Mail_Chimp_Handler::get_data();

		$token 		= isset($dataApi['token']) ? $dataApi['token'] : '';
		$listed 	=  $this->request['listed'];

	    // Get email - required field
        $email = isset($params['email']) ? sanitize_email($params['email']) : '';

        // Build merge fields dynamically from remaining parameters
        $merge_fields = [];
        $reserved_fields = ['listed', 'double_opt_in', 'email', 'action'];

        foreach($params as $key => $value) {
            if(!in_array($key, $reserved_fields) && !empty($value)) {
                // Convert field name to uppercase Mailchimp merge tag
                $merge_tag = strtoupper($key);
                $merge_fields[$merge_tag] = sanitize_text_field($value);
            }
        }

		$data = [
			'email_address' => (($email != '') ? $email : ''),
		];

		if (!empty($merge_fields)) {
			$data['merge_fields'] = $merge_fields;
		}

		if(!empty($this->request['double_opt_in']) && $this->request['double_opt_in'] === 'yes') {
			$data['status'] = 'pending';
		} else {
			$data['status'] = 'subscribed';
		}

		$server = explode('-', $token);
		if( !is_array($server) || empty($token) || !isset($server[1]) ){
			$return['error'] = esc_html__( 'Please set API Key into Dashboard User Data. ', 'elementskit-lite' );
			return $return;
		}

		$url = 'https://'.$server[1].'.api.mailchimp.com/3.0/lists/'.$listed.'/members/';

		$response = wp_remote_post( $url, [
			'method' => 'POST',
			'data_format' => 'body',
			'timeout' => 45,
			'headers' => [
							'Authorization' => 'apikey '.$token,
							'Content-Type' => 'application/json; charset=utf-8'
					],
			'body' => wp_json_encode($data	)
			]
		);

		/* handle Mailchimp response */
		if ( is_wp_error( $response ) ) {
			$return['error'] = 'Something went wrong: ' . $response->get_error_message();
			return $return;
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$decoded = json_decode( $body, true );

		if ( $code >= 400 ) {
			if ( is_array( $decoded ) && ! empty( $decoded['title'] ) ) {
				$return['error'] = $decoded['title'];
			} else {
				$return['error'] = $body;
			}
		} else {
			// keep the original wp_remote_post response so JS can parse response.success.body
			$return['success'] = $response;
		}

		return $return;
    }
}
//https://us20.api.mailchimp.com/3.0/lists?apikey=24550c8cb06076781d51a80274a52878-us20
