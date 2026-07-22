<?php

namespace PopupBuilderBlock\Routes;

defined( 'ABSPATH' ) || exit;

use PopupBuilderBlock\Helpers\DataBase;
use PopupBuilderBlock\Helpers\UserAgent;
use PopupBuilderBlock\Helpers\GeoLocation;
use PopupBuilderBlock\Helpers\IPBlocking;

class Popup extends Api {
	private const TRACKING_RATE_LIMIT_WINDOW = 60; // 1 minute.
	private const TRACKING_RATE_LIMIT_ATTEMPTS = 30;

	protected function get_routes(): array {
        return [
            [
                'endpoint'            => '/popup/campaigns',
                'methods'             => 'GET',
                'callback'            => 'get_campaigns',
            ],
            [
                'endpoint'            => '/popup/date',
                'methods'             => 'GET',
                'callback'            => 'get_date',
				'args' => array(
					'cat' => array(
						'required' => true,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => function( $param ) {
							return in_array( $param, [ 'logs', 'subscribers' ], true );
						}
					),
				),
            ],
            [
                'endpoint'            => '/popup/logs',
                'methods'             => 'GET',
                'callback'            => 'get_logs',
				'args' => array(
					'campaignId' => array(
						'required' => false,
						'sanitize_callback' => 'absint'
					),
					'startDate' => array(
						'required' => true,
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
					'endDate' => array(
						'required' => true,
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
					'type' => array(
						'required' => true,
						'sanitize_callback' => 'sanitize_text_field',
						'validate_callback' => function( $param ) {
							return in_array( $param, [ 'devices', 'countries', 'browsers', 'referrers', 'campaigns', 'convertion' ], true );
						}
					),
				),
            ],
            [
                'endpoint'            => '/popup/logs',
                'methods'             => 'POST',
                'callback'            => 'insert_logs',
                'permission_callback' => [$this, 'pbb_nonce_permission_check'],
				'args' => array(
					'postId' => array(
						'required' => true,
						'sanitize_callback' => 'absint'
					),
				),
            ],
            [
                'endpoint'            => '/popup/logs',
                'methods'             => 'DELETE',
                'callback'            => 'delete_logs',
				'args' => array(
					'startDate' => array(
						'required' => true,
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
					'endDate' => array(
						'required' => true,
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
				),
            ],
            [
                'endpoint'            => '/popup/logs',
                'methods'             => 'PUT',
                'callback'            => 'update_logs',
                'permission_callback' => [$this, 'pbb_nonce_permission_check'],
				'args' => array(
					'id' => array(
						'required' => true,
						'validate_callback' => function($param, $request, $key) {
							return is_numeric($param);
						},
						'sanitize_callback' => 'absint'
					),
					'refferer' => array(
						'required' => false,
						'sanitize_callback' => 'sanitize_text_field'
					),
					'converted' => array(
						'required' => false,
						'sanitize_callback' => function($param, $request, $key) {
							return (bool) $param;
						}
					),
				),
            ],
        ];
    }

	public function pbb_nonce_permission_check(): bool {
		// check for nonce
		return isset( $_SERVER['HTTP_X_WP_NONCE'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_WP_NONCE'] ) ), 'wp_rest' );
	}

	public function get_campaigns($request) {
		$params = $request->get_params();
		$is_subscribers = isset( $params['subscribers'] ) ? (bool) $params['subscribers'] : false;

		if(!$is_subscribers) {
			$logs  = DataBase::getDB(
				[ 'campaign_id', 'SUM(views) AS total_views', 'SUM(converted) AS total_converted' ],
				'pbb_logs',
				[],
				0,
				false,
				'',           // order_by
				'campaign_id' // group_by
			);
		}
		
		// Fetch all campaigns from the database
		$args = array(
			'post_type'      => 'popupkit-campaigns',
			'posts_per_page' => -1,
			'post_status'    => $params['status'] ?? 'any', // Default to 'any' to include all statuses
		);
		$posts = get_posts( $args );

		if ( empty( $posts ) ) {
			return array(
				'status'  => 'error',
				'message' => 'No campaigns found',
			);
		}

		$campaigns = array();
		foreach ( $posts as $post ) {
			$campaign = array(
				'id'     => $post->ID,
				'title'  => $post->post_title,
				'date'   => $post->post_date,
				'status' => $post->post_status,
				'guid'   => $post->guid,
				'link'   => get_permalink( $post ),
			);

			if ( !$is_subscribers ) {
				$abtest = get_post_meta( $post->ID, 'abTest', true );
				$abtest_title = '';
				if(!empty($abtest)) {
					$abtest = DataBase::getDB('title', 'pbb_ab_tests', [ 'id = %d' => $abtest ]);
					$abtest_title = !empty($abtest) ? $abtest[0]->title : '';
				} 
				$campaign['meta'] = array(
					'type'             => get_post_meta( $post->ID, 'campaignType', true ),
					'status'             => get_post_meta( $post->ID, 'status', true ) == '1', // Explicitly cast to boolean
					'scheduleDateTime'   => get_post_meta( $post->ID, 'scheduleDateTime', true ) == '1', // Explicitly cast to boolean
					'scheduleOnDateValue'=> get_post_meta( $post->ID, 'scheduleOnDateValue', true ),
					'scheduleOffDateValue'=> get_post_meta( $post->ID, 'scheduleOffDateValue', true ),
					'scheduleTimeZone'   => get_post_meta( $post->ID, 'scheduleTimeZone', true ),
					'abTest' 		  => $abtest_title, 
				);
				$campaign['author'] = get_the_author_meta( 'display_name', $post->post_author );

				$campaign['views'] = $logs ? array_reduce( $logs, function( $carry, $item ) use ( $post ) {
					return $carry + ( $item->campaign_id == $post->ID ? $item->total_views : 0 );
				}, 0 ) : 0;
				$campaign['converted'] = $logs ? array_reduce( $logs, function( $carry, $item ) use ( $post ) {
					return $carry + ( $item->campaign_id == $post->ID ? $item->total_converted : 0 );
				}, 0 ) : 0;
			}

			$campaigns[] = $campaign;
		}


		return array(
			'status'     => 'success',
			'data'  => $campaigns,
			'message'    => 'Campaigns fetched successfully',
		);
	}

	public function get_date( $request ) {
		global $wpdb;
		$table = $request['cat'] ?? '';
		$allowed_tables = array(
			'logs'        => 'pbb_logs',
			'subscribers' => 'pbb_subscribers',
		);

		if ( ! isset( $allowed_tables[ $table ] ) ) {
			return array(
				'status'  => 'error',
				'message' => 'Invalid table requested',
			);
		}

		$table_name = $wpdb->prefix . $allowed_tables[ $table ];
		$data	= $wpdb->get_results(
			$wpdb->prepare("SELECT 
				date
				FROM %i LIMIT 1;",
				$table_name
			)
		);

		if ( empty( $data ) ) {
			return array(
				'status'  => 'error',
				'message' => 'No data found',
			);
		}

		return array(
			'status'  => 'success',
			'data'    => $data,
			'message' => 'Data fetched successfully',
		);
	}

	public function get_logs( $request ) {
		// Validate the request parameters
		$campaign_id = $request['campaignId'] ?? '';
		$start_date  = $request['startDate'] ?? '';
		$end_date    = $request['endDate'] ?? '';
		$method_map = [
			'devices'    => 'get_devices',
			'countries'  => 'get_countries',
			'browsers'   => 'get_browsers',
			'referrers'  => 'get_referrers',
			'campaigns'  => 'get_campaigns',
			'convertion' => 'get_convertion',
		];
		$method = isset( $request['type'] ) ? ( $method_map[ $request['type'] ] ?? '' ) : '';

		if ( empty( $start_date ) || empty( $end_date ) || empty( $method ) ) {
			return array(
				'status'  => 'error',
				'message' => 'Invalid parameters',
			);
		}

		if ( empty( $method ) || ! method_exists( DataBase::class, $method ) ) {
			return array(
				'status'  => 'error',
				'message' => 'Invalid type provided',
			);
		}

		// Call the appropriate method dynamically
		$data = DataBase::$method( $campaign_id, $start_date, $end_date );

		if ( empty( $data ) ) {
			return array(
				'status'  => 'error',
				'message' => 'Data not found',
			);
		}

		return array(
			'status'  => 'success',
			'data'    => $data,
			'message' => 'Data fetched successfully',
		);
	}

	public function insert_logs( $request ) {
		$campaign_id = $request['postId'];
		if ( $this->is_tracking_rate_limited( 'insert', $campaign_id ) ) {
			return new \WP_REST_Response(
				[
					'status'  => 'error',
					'message' => esc_html__( 'Too many analytics requests. Please retry shortly.', 'popup-builder-block' ),
				],
				429
			);
		}

		if ( ! $campaign_id ) {
			return new \WP_REST_Response(
				[
					'status'  => 'error',
					'message' => esc_html__( 'Invalid campaign.', 'popup-builder-block' ),
				],
				400
			);
		}

		$location = GeoLocation::get_location();
		$country = $location->country ?? '';
		$browser = UserAgent::get_browser() ?? '';
		$device = UserAgent::get_device();

		$user_details = array(
			'browser' => $browser,
			'device'  => $device,
			'country' => $country,
		);


		$current_date = gmdate( 'Y-m-d' );
		$log_id = DataBase::insertOrUpdateLog($campaign_id, $current_date, $device);

		if(!empty($browser)) DataBase::insertOrUpdateBrowser($log_id, $browser);
		if(!empty($country)) DataBase::insertOrUpdateCountry($log_id, $country);

		return array(
			'status'  => 'success',
			'data'    => array(
				'logId' => $log_id,
				'userDetails'	=> $user_details,
				'location' => $location
			),
			'message' => 'Logs inserted successfully',
		);
	}

	public function update_logs( $request ) {
		$id   = $request['id'];
		if ( $this->is_tracking_rate_limited( 'update', $id ) ) {
			return new \WP_REST_Response(
				[
					'status'  => 'error',
					'message' => esc_html__( 'Too many analytics requests. Please retry shortly.', 'popup-builder-block' ),
				],
				429
			);
		}

		$refferer = $request['refferer'] ?? '';
		$where = array( 'id = %d' => $id );

		$logs = DataBase::getDB( "*", 'pbb_logs', $where );
		if ( empty( $logs ) ) {
			return rest_ensure_response(
				array(
					'status'  => 'error',
					'message' => 'Log not found',
				)
			);
		}

		$data = array(
			'converted' => isset( $request['converted'] ) ? $logs[0]->converted + 1 : $logs[0]->converted,
		);

		$updated = DataBase::updateDB( 'pbb_logs', $data, array( 'id' => $id ) );
		if(!empty($refferer)) DataBase::insertOrUpdateReferrer($id, $refferer);

		if ( ! $updated ) {
			return array(
				'status'  => 'error',
				'message' => 'Failed to update logs',
			);
		}

		return array(
			'status'  => 'success',
			'data'    => $updated,
			'message' => 'Logs updated successfully',
		);
	}

	private function is_tracking_rate_limited( $action, $target_id ) {
		$window = (int) apply_filters( 'popup_builder_block/tracking_rate_limit_window', self::TRACKING_RATE_LIMIT_WINDOW );
		$limit  = (int) apply_filters( 'popup_builder_block/tracking_rate_limit_attempts', self::TRACKING_RATE_LIMIT_ATTEMPTS );

		$window = max( MINUTE_IN_SECONDS, $window );
		$limit  = max( 1, $limit );

		$ip = IPBlocking::get_visitor_ip();
		if ( empty( $ip ) ) {
			return false;
		}

		$key     = sprintf( 'pbb_tracking_rate_%s', md5( "{$action}|{$target_id}|{$ip}" ) );
		$attempt = (int) get_transient( $key );
		if ( $attempt >= $limit ) {
			return true;
		}

		set_transient( $key, $attempt + 1, $window );
		return false;
	}

	public function delete_logs( $request ) {
		$start_date = $request['startDate'] ?? '';
		$end_date   = $request['endDate'] ?? '';

		$deleted = DataBase::deleteExpiredData( array( 'start_date' => $start_date, 'end_date' => $end_date ) );
		if ( empty( $deleted ) ) {
			return array(
				'status'  => 'error',
				'message' => 'No data found to delete',
			);
		}

		return array(
			'status'  => 'success',
			'data'    => $deleted,
			'message' => 'Data deleted successfully!',
		);
	}
}
