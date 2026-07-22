<?php

namespace PopupBuilderBlock\Helpers;

defined( 'ABSPATH' ) || exit;

/**
 * Global helper class.
 *
 * @since 1.0.0
 */

class DataBase {

	private static $LOGS_TABLE        = 'pbb_logs';
	private static $SUBSCRIBERS_TABLE = 'pbb_subscribers';
	private static $COUNTRIES_TABLE   = 'pbb_countries';
	private static $BROWSERS_TABLE  = 'pbb_browsers';
	private static $REFERRERS_TABLE   = 'pbb_referrers';
	private static $LOG_COUNTRIES = 'pbb_log_countries';
	private static $LOG_BROWSERS = 'pbb_log_browsers';
	private static $LOG_REFERRERS = 'pbb_log_referrers';
	private static $AB_TESTS_TABLE   = 'pbb_ab_tests';
	private static $AB_TESTS_VARIANTS_TABLE = 'pbb_ab_test_variants';
	private static $POST_TABLE = 'posts';

	public static $DATABASE_KEY	  = 'pbb_db_version';
	public static $DATABASE_VERSION  = '1.1.0';

	private static function allowed_tables() {
		return array(
			self::$LOGS_TABLE,
			self::$SUBSCRIBERS_TABLE,
			self::$COUNTRIES_TABLE,
			self::$BROWSERS_TABLE,
			self::$REFERRERS_TABLE,
			self::$LOG_COUNTRIES,
			self::$LOG_BROWSERS,
			self::$LOG_REFERRERS,
			self::$AB_TESTS_TABLE,
			self::$AB_TESTS_VARIANTS_TABLE,
		);
	}

	private static function get_table_name( $table ) {
		global $wpdb;

		if ( ! in_array( $table, self::allowed_tables(), true ) ) {
			return false;
		}

		return $wpdb->prefix . $table;
	}

	private static function sanitize_order_group_clause( $clause, $allow_sort_direction = false ) {
		if ( empty( $clause ) ) {
			return '';
		}

		$parts = is_array( $clause ) ? $clause : explode( ',', (string) $clause );
		$clean = array();

		foreach ( $parts as $part ) {
			$part = trim( (string) $part );
			if ( '' === $part ) {
				continue;
			}

			$pattern = $allow_sort_direction
				? '/^[A-Za-z0-9_]+(?:\s+(?:ASC|DESC))?$/i'
				: '/^[A-Za-z0-9_]+$/';

			if ( ! preg_match( $pattern, $part ) ) {
				return '';
			}

			$clean[] = $part;
		}

		return implode( ', ', $clean );
	}

	private static function sanitize_where_condition( $condition ) {
		return preg_match( '/^[A-Za-z0-9_\s%=<>()]+$/', $condition ) ? $condition : false;
	}
	/**
	 * Create the database table.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public static function createDB() {
		global $wpdb;
	
		$charset_collate = $wpdb->get_charset_collate();
	
		// Table names with prefix
		$logs_table        = $wpdb->prefix . self::$LOGS_TABLE;
		$subscribers_table  = $wpdb->prefix . self::$SUBSCRIBERS_TABLE;
		$countries_table   = $wpdb->prefix . self::$COUNTRIES_TABLE;
		$browsers_table    = $wpdb->prefix . self::$BROWSERS_TABLE;
		$referrers_table   = $wpdb->prefix . self::$REFERRERS_TABLE;
		$log_countries     = $wpdb->prefix . self::$LOG_COUNTRIES;
		$log_browsers      = $wpdb->prefix . self::$LOG_BROWSERS;
		$log_referrers     = $wpdb->prefix . self::$LOG_REFERRERS;
	
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	
		// Main logs table
		$sql = "CREATE TABLE IF NOT EXISTS $logs_table (
			id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			campaign_id BIGINT UNSIGNED NOT NULL,
			views INT DEFAULT 0,
			converted INT DEFAULT 0,
			date DATE NOT NULL,
	
			device_desktop INT DEFAULT 0,
			device_tablet INT DEFAULT 0,
			device_mobile INT DEFAULT 0,
	
			KEY campaign_id (campaign_id),
			KEY date (date),
			KEY campaign_date (campaign_id, date)
		) $charset_collate;";
		dbDelta($sql);
	
		// Countries table
		$sql = "CREATE TABLE IF NOT EXISTS $countries_table (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			country_name VARCHAR(2) NOT NULL
		) $charset_collate;";
		dbDelta($sql);
	
		// Browsers table
		$sql = "CREATE TABLE IF NOT EXISTS $browsers_table (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			browser_name VARCHAR(100) NOT NULL
		) $charset_collate;";
		dbDelta($sql);
	
		// Referrers table
		$sql = "CREATE TABLE IF NOT EXISTS $referrers_table (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			referrer_name TEXT NOT NULL
		) $charset_collate;";
		dbDelta($sql);
	
		// Pivot: Logs x Countries
		$sql = "CREATE TABLE IF NOT EXISTS $log_countries (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			log_id BIGINT UNSIGNED NOT NULL,
			country_id INT UNSIGNED NOT NULL,
			count INT NOT NULL DEFAULT 0,
			FOREIGN KEY (log_id) REFERENCES $logs_table(id) ON DELETE CASCADE,
			FOREIGN KEY (country_id) REFERENCES $countries_table(id) ON DELETE CASCADE,
			KEY log_country (log_id, country_id)
		) $charset_collate;";
		dbDelta($sql);
	
		// Pivot: Logs x Browsers
		$sql = "CREATE TABLE IF NOT EXISTS $log_browsers (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			log_id BIGINT UNSIGNED NOT NULL,
			browser_id INT UNSIGNED NOT NULL,
			count INT NOT NULL DEFAULT 0,
			FOREIGN KEY (log_id) REFERENCES $logs_table(id) ON DELETE CASCADE,
			FOREIGN KEY (browser_id) REFERENCES $browsers_table(id) ON DELETE CASCADE,
			KEY log_browser (log_id, browser_id)
		) $charset_collate;";
		dbDelta($sql);
	
		// Pivot: Logs x Referrers
		$sql = "CREATE TABLE IF NOT EXISTS $log_referrers (
			id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			log_id BIGINT UNSIGNED NOT NULL,
			referrer_id INT UNSIGNED NOT NULL,
			count INT NOT NULL DEFAULT 0,
			FOREIGN KEY (log_id) REFERENCES $logs_table(id) ON DELETE CASCADE,
			FOREIGN KEY (referrer_id) REFERENCES $referrers_table(id) ON DELETE CASCADE,
			KEY log_referrer (log_id, referrer_id)
		) $charset_collate;";
		dbDelta($sql);

		// Create the subscribers table
		$sql        = "CREATE TABLE IF NOT EXISTS $subscribers_table (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            campaign_id BIGINT UNSIGNED NOT NULL,
			campaign_title VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            name VARCHAR(100) NOT NULL,
            date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            form_data TEXT NOT NULL,
            user_data VARCHAR(100) NOT NULL,
            PRIMARY KEY (id),
            KEY campaign_id (campaign_id),
            KEY date (date),
            KEY campaign_date (campaign_id, date)
        ) $charset_collate;";
		dbDelta( $sql );

		self::createABTestTables();

		// Save the database version
		add_option( self::$DATABASE_KEY, self::$DATABASE_VERSION );
	}

	public static function createABTestTables() {
		global $wpdb;

		$charset_collate = $wpdb->get_charset_collate();

		// Table names with prefix
		$ab_tests_table = $wpdb->prefix . self::$AB_TESTS_TABLE;
		$campaigns_table = $wpdb->prefix . self::$POST_TABLE;
		$ab_test_variants_table = $wpdb->prefix . self::$AB_TESTS_VARIANTS_TABLE;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		// Create the AB tests table
		$sql            = "CREATE TABLE IF NOT EXISTS $ab_tests_table (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			title VARCHAR(255) NOT NULL,
			type VARCHAR(10) NOT NULL,
			status TINYINT UNSIGNED NOT NULL,
			metric VARCHAR(10) DEFAULT NULL,
			winner BIGINT UNSIGNED DEFAULT NULL,
			started_at DATETIME DEFAULT NULL,
			duration INT UNSIGNED DEFAULT NULL,
			PRIMARY KEY (id)
		) $charset_collate;";
		dbDelta( $sql );

		// Create the AB tests variants table
		$sql            = "CREATE TABLE IF NOT EXISTS $ab_test_variants_table (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			test_id BIGINT UNSIGNED NOT NULL,
			campaign_id BIGINT UNSIGNED NOT NULL,
			views INT DEFAULT 0,
			converted INT DEFAULT 0,
			PRIMARY KEY (id),
			KEY test_id (test_id),
			KEY campaign_id (campaign_id),
			FOREIGN KEY (test_id) REFERENCES $ab_tests_table(id) ON DELETE CASCADE,
			FOREIGN KEY (campaign_id) REFERENCES $campaigns_table(ID) ON DELETE CASCADE
		) $charset_collate;";
		dbDelta( $sql );
	}

	/**
	 * Insert or update log entry.
	 *
	 * @param int    $campaign_id  Campaign ID.
	 * @param string $date         Date of the log entry.
	 * @param string $device_type  Device type (desktop, mobile, tablet).
	 * 
	 * @return bool
	 * @since 1.0.0
	 */
	public static function insertOrUpdateLog($campaign_id, $date, $device_type = null) {
		global $wpdb;
	
		$table = esc_sql( $wpdb->prefix . 'pbb_logs' );
	
		// Check if log already exists for this campaign + date
		$existing = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM %i WHERE campaign_id = %d AND date = %s", 
				$table,
				$campaign_id,
				$date
			)
		);

		$device = $device_type ? "device_$device_type" : false;
	
		if ($existing) {
			$fields = ['views' => $existing->views + 1];
			
			if($device) {
				$fields[$device] = $existing->{"$device"} + 1;
			}
	
			$wpdb->update($table, $fields, ['id' => $existing->id]);
			return $existing->id;
		} else {
			$fields = [
				'campaign_id' => $campaign_id,
				'date' => $date,
				'views' => 1,
			];

			if($device) {
				$fields[$device] = 1;
			}

			$wpdb->insert($table, $fields);
			return $wpdb->insert_id;
		}
	}

	private static function insertOrUpdateTable($table, $name, $value) {
		global $wpdb;
	
		$table_name = $wpdb->prefix . $table;
	
		// Check if the name already exists in the table
		$id = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM %i WHERE %i = %s", 
				$table_name, 
				$name, 
				$value
			)
		);
	
		if (!$id) {
			$wpdb->insert($table_name, [$name => $value]);
			return $wpdb->insert_id;
		}
	
		return $id;
	}

	private static function insertOrUpdatePivotTable($pivot_table, $id_name, $log_id, $id) {
		global $wpdb;

		$table_name = $wpdb->prefix . $pivot_table;
	
		// Check if the log_id and id already exist in the pivot table
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT id, count FROM %i WHERE log_id = %d AND %i = %d", 
				$table_name, 
				$log_id, 
				$id_name,
				$id
			)
		);
	
		if ($row) {
			$wpdb->update($table_name, ['count' => $row->count + 1], ['id' => $row->id]);
		} else {
			$wpdb->insert($table_name, [
				'log_id' => $log_id,
				$id_name => $id,
				'count' => 1
			]);
		}
	}
	

	public static function insertOrUpdateBrowser($log_id, $browser_name) {
		$id = self::insertOrUpdateTable('pbb_browsers', 'browser_name', $browser_name);
		self::insertOrUpdatePivotTable('pbb_log_browsers', 'browser_id', $log_id, $id);
	}
	

	public static function insertOrUpdateCountry($log_id, $country_name) {
		$id = self::insertOrUpdateTable('pbb_countries', 'country_name', $country_name);
		self::insertOrUpdatePivotTable('pbb_log_countries', 'country_id', $log_id, $id);
	}

	public static function insertOrUpdateReferrer($log_id, $referrer_name) {
		$id = self::insertOrUpdateTable('pbb_referrers', 'referrer_name', $referrer_name);
		self::insertOrUpdatePivotTable('pbb_log_referrers', 'referrer_id', $log_id, $id);
	}

	public static function get_devices($campaign_id, $start_date, $end_date) {
		global $wpdb;
	
		$table_name = $wpdb->prefix . self::$LOGS_TABLE;
	
		if ( $campaign_id ) {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT SUM(device_desktop) as desktop, 
					SUM(device_tablet) as tablet, 
					SUM(device_mobile) as mobile 
					FROM %i WHERE date BETWEEN %s AND %s AND campaign_id = %d",
					$table_name,
					$start_date,
					$end_date,
					$campaign_id
				)
			);
		} else {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT SUM(device_desktop) as desktop, 
					SUM(device_tablet) as tablet, 
					SUM(device_mobile) as mobile 
					FROM %i WHERE date BETWEEN %s AND %s",
					$table_name,
					$start_date,
					$end_date
				)
			);
		}
	}

	private static function get_data($campaign_id, $start_date, $end_date, $table, $log_table, $column, $id) {
		global $wpdb;
	
		$table_name = $wpdb->prefix . self::$LOGS_TABLE;
		$table = $wpdb->prefix . $table;
		$log_table = $wpdb->prefix . $log_table;
	
		if ( $campaign_id ) {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT t.%i, SUM(lt.count) AS total_count FROM %i logs JOIN %i lt ON lt.log_id = logs.id JOIN %i t ON t.id = lt.%i WHERE logs.date BETWEEN %s AND %s AND campaign_id = %d GROUP BY t.%i ORDER BY total_count DESC;",
					$column,
					$table_name,
					$log_table,
					$table,
					$id,
					$start_date,
					$end_date,
					$campaign_id,
					$column
				)
			);
		} else {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT t.%i, SUM(lt.count) AS total_count FROM %i logs JOIN %i lt ON lt.log_id = logs.id JOIN %i t ON t.id = lt.%i WHERE logs.date BETWEEN %s AND %s GROUP BY t.%i ORDER BY total_count DESC;",
					$column,
					$table_name,
					$log_table,
					$table,
					$id,
					$start_date,
					$end_date,
					$column
				)
			);
		}
	}

	public static function get_countries($campaign_id, $start_date, $end_date) {
		return self::get_data($campaign_id, $start_date, $end_date, 'pbb_countries', 'pbb_log_countries', 'country_name', 'country_id');
	}

	public static function get_browsers($campaign_id, $start_date, $end_date) {
		return self::get_data($campaign_id, $start_date, $end_date, 'pbb_browsers', 'pbb_log_browsers', 'browser_name', 'browser_id');
	}

	public static function get_referrers($campaign_id, $start_date, $end_date) {
		return self::get_data($campaign_id, $start_date, $end_date, 'pbb_referrers', 'pbb_log_referrers', 'referrer_name', 'referrer_id');
	}

	public static function get_campaigns($campaign_id, $start_date, $end_date) {
		global $wpdb;
	
		$table_name = $wpdb->prefix . self::$LOGS_TABLE;
	
		if ( $campaign_id ) {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT 
					campaign_id,
					SUM(converted) as count
					FROM %i WHERE date BETWEEN %s AND %s AND campaign_id = %d GROUP BY campaign_id ORDER BY count DESC;",
					$table_name,
					$start_date,
					$end_date,
					$campaign_id
				)
			);
		} else {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT 
					campaign_id,
					SUM(converted) as count
					FROM %i WHERE date BETWEEN %s AND %s GROUP BY campaign_id ORDER BY count DESC;",
					$table_name,
					$start_date,
					$end_date
				)
			);
		}
	}

	public static function get_convertion( $campaign_id, $start_date, $end_date ) {
		global $wpdb;

		$table_name = $wpdb->prefix . self::$LOGS_TABLE;
		
		if ( $campaign_id ) {
			$grouped_data = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT DATE(date) AS dateLog, SUM(views) AS totalViews, SUM(converted) AS totalConverted FROM %i WHERE DATE(date) BETWEEN %s AND %s AND campaign_id = %d GROUP BY DATE(date);",
					$table_name,
					$start_date,
					$end_date,
					$campaign_id
				)
			);
			$total_data = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT SUM(views) AS totalViews, SUM(converted) AS totalConverted FROM %i WHERE DATE(date) BETWEEN %s AND %s AND campaign_id = %d",
					$table_name,
					$start_date,
					$end_date,
					$campaign_id
				)
			);
		} else {
			$grouped_data = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT DATE(date) AS dateLog, SUM(views) AS totalViews, SUM(converted) AS totalConverted FROM %i WHERE DATE(date) BETWEEN %s AND %s GROUP BY DATE(date);",
					$table_name,
					$start_date,
					$end_date
				)
			);
			$total_data = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT SUM(views) AS totalViews, SUM(converted) AS totalConverted FROM %i WHERE DATE(date) BETWEEN %s AND %s",
					$table_name,
					$start_date,
					$end_date
				)
			);
		}

		return array(
			'group' => $grouped_data,
			'total'   => $total_data,
		);
	}
	
	/**
	 * Drop the database table.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public static function dropDB() {
		global $wpdb;

		$tables = array(
			'log_countries' => self::$LOG_COUNTRIES,
			'log_browsers'  => self::$LOG_BROWSERS,
			'log_referrers' => self::$LOG_REFERRERS,
			'logs'        => self::$LOGS_TABLE,
			'subscribers' => self::$SUBSCRIBERS_TABLE,
			'browsers'    => self::$BROWSERS_TABLE,
			'countries'   => self::$COUNTRIES_TABLE,
			'referrers'   => self::$REFERRERS_TABLE,
		);

		foreach ( $tables as $table ) {
			$table_name = $wpdb->prefix . $table;
			$wpdb->query( 
				$wpdb->prepare( "DROP TABLE IF EXISTS %i;", $table_name )
			);
		}
		
		// Delete the database version option
		delete_option( self::$DATABASE_KEY );
	}

	/**
	 * Insert into database table.
	 *
	 * @return bool
	 * @since 1.0.0
	 */
	public static function insertDB( $table, $data ) {
		global $wpdb;

		$table_name = self::get_table_name( $table );
		if ( false === $table_name ) {
			return false;
		}

		$wpdb->insert( $table_name, $data );
		return $wpdb->insert_id;
	}

	public static function insert_subscriber( $data ) {
		if ( empty( $data['email'] ) || ! is_email( $data['email'] ) ) {
			return rest_ensure_response([
				'status'  => 'error',
				'message' => esc_html__('Invalid email address', 'popup-builder-block')
			]);
		}
		$where = array(
			"email = %s" => esc_sql( $data['email'] ),
			"campaign_id = %d" => esc_sql( $data['campaign_id'] ),
		);

		$is_old_data = DataBase::getDB( 'id', 'pbb_subscribers', $where, 1 );

		// Insert into the database
		if ( $is_old_data ) {
			return false;
		}

		return DataBase::insertDB( 'pbb_subscribers', $data );
	}

	/**
	 * Get data from database table.
	 * @param array|string $columns 
	 * @param string $table
	 * @param array $where
	 * @param int $limit
	 * @param bool $count
	 * @param string|array $order_by
	 * @param string|array $group_by
	 * 
	 * @return array
	 * @since 1.0.0
	 */
	public static function getDB( $columns, $table, $where = [], $limit = 0, $count = false, $order_by = '', $group_by = '' ) {
		global $wpdb;

		$table_name = self::get_table_name( $table );
		if ( false === $table_name ) {
			return array();
		}

		// Handle columns (support string or array)
		if ( is_array( $columns ) ) {
			$columns = array_map( 'esc_sql', $columns );
			$columns = implode( ', ', $columns );
		} else {
			$columns = esc_sql( $columns );
		}

		// Base SQL
		$sql = $count
			? "SELECT COUNT($columns) FROM $table_name"
			: "SELECT $columns FROM $table_name";

		$where_sql = '';
		$prepare_values = [];

		// Handle array-based WHERE conditions
		if ( is_array( $where ) && ! empty( $where ) ) {
			$where_parts = [];
			foreach ( $where as $condition => $values ) {
				$condition = self::sanitize_where_condition( $condition );
				if ( false === $condition ) {
					return array();
				}

				$where_parts[] = '(' . $condition . ')';
				if ( is_array( $values ) ) {
					$prepare_values = array_merge( $prepare_values, $values );
				} else {
					$prepare_values[] = $values;
				}
			}
			$where_sql = ' WHERE ' . implode( ' AND ', $where_parts );
		}

		$sql .= $where_sql;

		// GROUP BY support
		if ( $group_by ) {
			$group_by = self::sanitize_order_group_clause( $group_by );
			if ( empty( $group_by ) ) {
				return array();
			}

			$sql .= " GROUP BY $group_by";
		}

		// ORDER BY (sanitized)
		if ( $order_by ) {
			$order_by = self::sanitize_order_group_clause( $order_by, true );
			if ( empty( $order_by ) ) {
				return array();
			}

			$sql .= " ORDER BY $order_by";
		}

		// LIMIT (integer)
		if ( $limit ) {
			$limit = absint( $limit );
			$sql  .= " LIMIT %d";
			$prepare_values[] = $limit;
		}

		// Prepare query if values exist
		if ( ! empty( $prepare_values ) ) {
			$sql = $wpdb->prepare( $sql, $prepare_values ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		}

		return $wpdb->get_results( $sql ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
	}

	/**
	 * Update data in database table.
	 *
	 * @param string $table
	 * @param array  $data
	 * @param array  $where
	 * @return bool
	 * @since 1.0.0
	 */
	public static function updateDB( $table, $data, $where ) {
		global $wpdb;

		$table_name = self::get_table_name( $table );
		if ( false === $table_name ) {
			return false;
		}

		return $wpdb->update( $table_name, $data, $where );
	}


	/**
	 * Delete data from database table.
	 *
	 * @param string    $table
	 * @param int|array $id
	 * @param string    $field
	 * @return bool
	 * @since 1.0.0
	 */
	public static function deleteDB( $table, $id, $field = 'id' ) {
		global $wpdb;

		if ( ! isset( $id ) ) {
			return false;
		}

		if ( ! preg_match( '/^[A-Za-z0-9_]+$/', (string) $field ) ) {
			return false;
		}

		// If id is array then delete multiple rows and if id is integer then delete single row
		$table_name = self::get_table_name( $table );
		if ( false === $table_name ) {
			return false;
		}

		if ( is_array( $id ) ) {
			$placeholders = implode( ',', array_fill( 0, count( $id ), '%d' ) );
			$sql = $wpdb->prepare(
				"DELETE FROM %i WHERE $field IN ($placeholders)", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				array_merge( array( $table_name ), $id ) 
			);
		} else {
			$sql = $wpdb->prepare(
				"DELETE FROM %i WHERE %i = %d",
				$table_name,
				$field,
				$id
			);
		}

		return $wpdb->query( $sql ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
	}

	public static function deleteExpiredData($data) {
		global $wpdb;
		
		$data_tables = array(
			self::$LOG_COUNTRIES, // Delete from pivot tables first (foreign key constraints)
			self::$LOG_BROWSERS,
			self::$LOG_REFERRERS,
			self::$LOGS_TABLE, // Delete from main logs table
		);
		$expire_time = $data['expire_time'] ?? '';
		$start_date = $data['start_date'] ?? '';
		$end_date = $data['end_date'] ?? '';

		if( !empty($expire_time) ) {
			$date_limit = gmdate('Y-m-d', strtotime("-{$expire_time} years"));

			// Step 1: Get old log IDs
			$logs_table = $wpdb->prefix . self::$LOGS_TABLE;
			$old_log_ids = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT id FROM %i WHERE date < %s", 
					$logs_table,
					$date_limit
				)
			);
		
			if (empty($old_log_ids)) {
				return []; // No old logs to delete
			}

			return self::delete_logs($wpdb, $data_tables, $old_log_ids);
		}

		if( !empty($start_date) && !empty($end_date) ) {
			// Step 1: Get log IDs in the given date range
			$logs_table = $wpdb->prefix . self::$LOGS_TABLE;
			$range_log_ids = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT id FROM %i WHERE date BETWEEN %s AND %s", 
					$logs_table,
					$start_date,
					$end_date
				)
			);

			if (empty($range_log_ids)) {
				return []; // No logs in this range
			}

			return self::delete_logs($wpdb, $data_tables, $range_log_ids);
		}
	}

	private static function delete_logs($wpdb, $data_tables, $log_ids) {
		$deleted_logs = array();
		$placeholders = implode(',', array_fill(0, count($log_ids), '%d'));

		foreach ($data_tables as $table) {
			$table_name = $wpdb->prefix . $table;
			// Use `id` for the main logs table, `log_id` for others
			$column = ($table === self::$LOGS_TABLE) ? 'id' : 'log_id';
			$deleted_logs[] = $wpdb->query( 
				$wpdb->prepare(
					"DELETE FROM %i WHERE $column IN ($placeholders)", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					array_merge( array( $table_name ), $log_ids )
				)
			);
		}
		return $deleted_logs;
	}
}
