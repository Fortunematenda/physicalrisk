<?php

namespace PopupBuilderBlock\Routes;

defined( 'ABSPATH' ) || exit;

use PopupBuilderBlock\Helpers\DataBase;
use PopupBuilderBlock\Helpers\IPBlocking;

class Subscribers extends Api {
	private const RATE_LIMIT_WINDOW = 300; // 5 minutes.
	private const RATE_LIMIT_ATTEMPTS = 10;

	protected function get_routes(): array {
        return [
            [
                'endpoint'            => '/subscribers',
                'methods'             => 'POST',
                'callback'            => 'increase_subscribers',
				'permission_callback' => [$this, 'pbb_nonce_permission_check'],
            ],
            [
                'endpoint'            => '/subscribers',
                'methods'             => 'GET',
                'callback'            => 'get_subscribers_data',
				'args' => array(
					'start' => array(
						'required' => false,
						'validate_callback' => function($param, $request, $key) {
							if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $param)) {
								return true;
							}
							return new \WP_Error(
								'rest_invalid_param',
								/* translators: %s: Field name */
								sprintf(__('Invalid %s format. Expected YYYY-MM-DD.', 'popup-builder-block'), $key),
								['status' => 400]
							);
						},
					),
					'end' => array(
						'required' => false,
						'validate_callback' => function($param, $request, $key) {
							if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $param)) {
								return true;
							}
							return new \WP_Error(
								'rest_invalid_param',
								/* translators: %s: Field name */
								sprintf(__('Invalid %s format. Expected YYYY-MM-DD.', 'popup-builder-block'), $key),
								['status' => 400]
							);
						},
					),
					'order_by' => array(
						'required' => false,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => function($param, $request, $key) {
							$allowed_orders = ['date', 'campaign_id', 'name'];
							if (in_array($param, $allowed_orders, true)) {
								return true;
							}
							return new \WP_Error(
								'rest_invalid_param',
								/* translators: %s: Field name */
								sprintf(__('Invalid %s value. Allowed values are: %s.', 'popup-builder-block'), $key, implode(', ', $allowed_orders)),
								['status' => 400]
							);
						},
					),
					'limit' => array(
						'required' => false,
						'sanitize_callback' => 'absint'
					),
					'campaign_id' => array(
						'required' => false,
						'sanitize_callback' => 'absint'
					),
				),
            ],
            [
                'endpoint'            => '/subscribers',
                'methods'             => 'DELETE',
                'callback'            => 'delete_subscribers_data',
				'args' => array(
					'id' => array(
						'required' => true,
					),
				),
            ]
        ];
    }

	public function pbb_nonce_permission_check(): bool {
		// check for nonce
		return isset( $_SERVER['HTTP_X_WP_NONCE'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_WP_NONCE'] ) ), 'wp_rest' );
	}

	public function increase_subscribers( $param ) {
		if ( $this->is_rate_limited() ) {
			return new \WP_REST_Response(
				[
					'status'  => 'error',
					'message' => esc_html__( 'Too many form submissions. Please try again in a few minutes.', 'popup-builder-block' ),
				],
				429
			);
		}

		// Decode request body
		$data = json_decode($param->get_body(), true);

		if ( ! is_array( $data ) ) {
			return new \WP_REST_Response(
				[
					'status'  => 'error',
					'message' => esc_html__( 'Invalid payload.', 'popup-builder-block' ),
				],
				400
			);
		}

		// Sanitize inputs
		$campaign_id = absint($data['popup_id'] ?? '');
		if ( ! $campaign_id ) {
			return new \WP_REST_Response(
				[
					'status'  => 'error',
					'message' => esc_html__( 'Invalid campaign.', 'popup-builder-block' ),
				],
				400
			);
		}

		$campaign_title = get_the_title($campaign_id);
		$email       = sanitize_email($data['email'] ?? '');
		$name        = sanitize_text_field($data['name'] ?? '');
		$form_data   = wp_json_encode( $data['form_data'] ?? [] );
		$user_data   = $data['user_data'] ?? [];

		// Prepare data for database insertion
		$emailData        = wp_json_encode($data['emailData'] ?? []);
		$subscriber_data = compact('campaign_id', 'campaign_title', 'email', 'name', 'form_data', 'user_data');

		// Insert subscriber data
		$is_inserted = DataBase::insert_subscriber($subscriber_data);

		// Insert into the database
		if (!$is_inserted) {
			return rest_ensure_response([
				'status'  => 'error',
				'message' => esc_html__('You have already submitted this form', 'popup-builder-block')
			]);
		}

		/**
		 * -----------------------------------------
		 * AFTER DB INSERT → add emailData
		 * -----------------------------------------
		 */
		$emailData = $data['emailData'] ?? [];

		if ( ! empty( $emailData ) ) {
			$subscriber_data['emailData'] = $emailData;
		}

		// Define available integrations
		$integrations = [
			'mailchimp',
			'fluentCRM',
			'activeCampaign',
			'zapier',
			'hubspot',
			'pabbly',
			'aweber',
			'zoho',
			'mailerlite',
			'convertKit',
			'webhook',
			'klaviyo',
			'getResponse',
			'mailpoet',
			'brevo',
			'omnisend',
			'drip',
			'slack',
			'googleSheet',
			'moosend',
		];

		// Loop through integrations and add to subscriber data if present
		foreach ( $integrations as $integration ) {
			if ( isset($data[$integration]) ) {
				$subscriber_data[$integration] = $data[$integration];
			}
		}

		// Apply integration filter
		do_action('popup_builder_block_form_integration_submit', $subscriber_data);

		return rest_ensure_response([
			'status'  => 'success',
			'data'    => $subscriber_data,
			'message' => esc_html__('Form data submitted successfully', 'popup-builder-block')
		]);
	}

	private function is_rate_limited() {
		$window = (int) apply_filters( 'popup_builder_block/subscribers_rate_limit_window', self::RATE_LIMIT_WINDOW );
		$limit  = (int) apply_filters( 'popup_builder_block/subscribers_rate_limit_attempts', self::RATE_LIMIT_ATTEMPTS );

		$window = max( MINUTE_IN_SECONDS, $window );
		$limit  = max( 1, $limit );

		$ip = IPBlocking::get_visitor_ip();
		if ( empty( $ip ) ) {
			return false;
		}

		$key     = 'pbb_subscriber_rate_' . md5( $ip );
		$attempt = (int) get_transient( $key );

		if ( $attempt >= $limit ) {
			return true;
		}

		set_transient( $key, $attempt + 1, $window );
		return false;
	}

	public function get_subscribers_data( $param ) {
		$param = $param->get_params();
		$where = array();
		$limit = 0;
		$order_by = '';
		if ( isset( $param['start'] ) && isset( $param['end'] ) ) {
			$start = $param['start'];
			$end   = $param['end'];
			$where["date BETWEEN %s AND %s"] = array( "$start 00:00:00", "$end 23:59:59" );
		}

		if ( isset( $param['campaign_id'] ) ) {
			$campaign_id = $param['campaign_id'];
			$where["campaign_id = %d"] = $campaign_id;
		}

		if ( isset( $param['limit'] ) ) {
			$limit = $param['limit'];
		}

		if ( isset( $param['order_by'] ) ) {
			$order_by = $param['order_by'] . ' DESC';
		}

		$data = DataBase::getDB( "*", 'pbb_subscribers', $where, $limit, false, $order_by );

		if ( ! $data ) {
			return array(
				'status'  => 'error',
				'message' => 'No data found',
			);
		}

		return rest_ensure_response(
			array(
				'status'  => 'success',
				'data'    => $data,
				'message' => esc_html__( 'Form data fetched successfully', 'popup-builder-block' ),
			)
		);
	}

	public function delete_subscribers_data( $param ) {
		$id = $param['id'];
		$id = json_decode( $id, true );

		$deleted = DataBase::deleteDB( 'pbb_subscribers', $id );

		if ( ! $deleted ) {
			return array(
				'status'  => 'error',
				'message' => 'Failed to delete subscribers',
			);
		}

		return rest_ensure_response(
			array(
				'status'  => 'success',
				'message' => esc_html__( 'Form data deleted successfully', 'popup-builder-block' ),
			)
		);
	}
}
