<?php
namespace MetForm\Utils;

defined( 'ABSPATH' ) || exit;
/**
 * Global helper class.
 *
 * @since 1.0.0
 */

class Util{

	public static $instance = null;
	private static $key     = 'metform_options';
	
	public static function get_option( $key, $default = '' ) {
		$data_all = get_option( self::$key );
		return ( isset( $data_all[ $key ] ) && $data_all[ $key ] != '' ) ? $data_all[ $key ] : $default;
	}

	public static function save_option( $key, $value = '' ) {
		$data_all         = get_option( self::$key );
		$data_all[ $key ] = $value;
		return update_option(  self::$key, $data_all );
	}

	public static function get_settings( $key, $default = '' ) {
		$data_all = self::get_option( 'settings', array() );
		return ( isset( $data_all[ $key ] ) && $data_all[ $key ] != '' ) ? $data_all[ $key ] : $default;
	}

	public static function save_settings( $new_data = array() ) {
		// Ensure $new_data is always an array
		if ( ! is_array( $new_data ) ) {
			$new_data = array();
		}
		
		$data_old = self::get_option( 'settings', array() );
		$data     = array_merge( $data_old, $new_data );
		return self::save_option( 'settings', $data );
	}

	public static function metform_admin_action() {
		// Check for nonce security
		$status = '';
		
		if (!isset($_POST['nonce']) || ! wp_verify_nonce( sanitize_key(wp_unslash($_POST['nonce'])), 'ajax-nonce' ) ) {
			return;
		}
		

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

	
		if ( isset( $_POST['settings'] ) ) {
			$status = self::save_settings( empty( $_POST['settings'] ) ? array() : map_deep( wp_unslash( $_POST['settings'] ) , 'sanitize_text_field' )  ); 
		}

		if($status){
			wp_send_json_success();
		}else{
			wp_send_json_error();
		}
		exit;
	}

	public static function instance() {
		if ( is_null( self::$instance ) ) {

			// Fire the class instance
			self::$instance = new self();
		}

		return self::$instance;
	}

    /**
     * Support For HTML Entities
     *
     * @since 1.3.1
     * @access public
     */
    public static function react_entity_support($str, $render_on_editor) {
		if ( !\Elementor\Plugin::$instance->editor->is_edit_mode() || $render_on_editor ):
			  $str = '${ parent.decodeEntities(`'. $str .'`) } ';
		endif;
		
		return $str;
    }

    /**
     * Get metform older version if has any.
     *
     * @since 1.0.0
     * @access public
     */
    public static function old_version(){
        $version = get_option('metform_version');
        return null == $version ? -1 : $version;
    }

    /**
     * Set metform installed version as current version.
     *
     * @since 1.0.0
     * @access public
     */
    public static function set_version(){
	}

    /**
     * Auto generate classname from path.
     *
     * @since 1.0.0
     * @access public
     */
    public static function make_classname( $dirname ) {
        $dirname = pathinfo($dirname, PATHINFO_FILENAME);
        $class_name	 = explode( '-', $dirname );
        $class_name	 = array_map( 'ucfirst', $class_name );
        $class_name	 = implode( '_', $class_name );

        return $class_name;
	}

	public static function google_fonts($font_families = []) {
		$fonts_url         = '';
		if ( $font_families ) {
			$query_args = array(
				'family' => urlencode( implode( '|', $font_families ) )
			);

			$fonts_url = add_query_arg( $query_args, 'https://fonts.googleapis.com/css' );
		}

		return esc_url_raw( $fonts_url );
	}

  	public static function kses( $raw ) {

		$allowed_tags = array(
			'a'								 => array(
				'class'	 => array(),
				'href'	 => array(),
				'rel'	 => array(),
				'title'	 => array(),
				'target' => array(),
			),
			'abbr'							 => array(
				'title' => array(),
			),
			'b'								 => array(),
			'blockquote'					 => array(
				'cite' => array(),
			),
			'cite'							 => array(
				'title' => array(),
			),
			'code'							 => array(),
			'del'							 => array(
				'datetime'	 => array(),
				'title'		 => array(),
			),
			'dd'							 => array(),
			'div'							 => array(
				'class'	 => array(),
				'title'	 => array(),
				'style'	 => array(),
			),
			'dl'							 => array(),
			'dt'							 => array(),
			'em'							 => array(),
			'h1'							 => array(
				'class' => array(),
			),
			'h2'							 => array(
				'class' => array(),
			),
			'h3'							 => array(
				'class' => array(),
			),
			'h4'							 => array(
				'class' => array(),
			),
			'h5'							 => array(
				'class' => array(),
			),
			'h6'							 => array(
				'class' => array(),
			),
			'i'								 => array(
				'class' => array(),
			),
			'img'							 => array(
				'alt'	 => array(),
				'class'	 => array(),
				'height' => array(),
				'src'	 => array(),
				'width'	 => array(),
			),
			'li'							 => array(
				'class' => array(),
			),
			'ol'							 => array(
				'class' => array(),
			),
			'p'								 => array(
				'class' => array(),
			),
			'q'								 => array(
				'cite'	 => array(),
				'title'	 => array(),
			),
			'span'							 => array(
				'class'	 => array(),
				'title'	 => array(),
				'style'	 => array(),
			),
			'iframe'						 => array(
				'width'			 => array(),
				'height'		 => array(),
				'scrolling'		 => array(),
				'frameborder'	 => array(),
				'allow'			 => array(),
				'src'			 => array(),
			),
			'strike'						 => array(),
			'br'							 => array(),
			'strong'						 => array(),
			'data-wow-duration'				 => array(),
			'data-wow-delay'				 => array(),
			'data-wallpaper-options'		 => array(),
			'data-stellar-background-ratio'	 => array(),
			'ul'							 => array(
				'class' => array(),
			),
		);

		if ( function_exists( 'wp_kses' ) ) { // WP is here
			return wp_kses( $raw, $allowed_tags );
		} else {
			return $raw;
		}
	}
  	public static function get_kses_array(  ) {

		$allowed_tags = array(
			'a'								 => array(
				'class'	 => array(),
				'href'	 => array(),
				'rel'	 => array(),
				'title'	 => array(),
				'target' => array(),
			),
			'abbr'							 => array(
				'title' => array(),
			),
			'b'								 => array(),
			'blockquote'					 => array(
				'cite' => array(),
			),
			'cite'							 => array(
				'title' => array(),
			),
			'code'							 => array(),
			'del'							 => array(
				'datetime'	 => array(),
				'title'		 => array(),
			),
			'dd'							 => array(),
			'div'							 => array(
				'class'	 => array(),
				'title'	 => array(),
				'style'	 => array(),
			),
			'dl'							 => array(),
			'dt'							 => array(),
			'em'							 => array(),
			'h1'							 => array(
				'class' => array(),
			),
			'h2'							 => array(
				'class' => array(),
			),
			'h3'							 => array(
				'class' => array(),
			),
			'h4'							 => array(
				'class' => array(),
			),
			'h5'							 => array(
				'class' => array(),
			),
			'h6'							 => array(
				'class' => array(),
			),
			'i'								 => array(
				'class' => array(),
			),
			'img'							 => array(
				'alt'	 => array(),
				'class'	 => array(),
				'height' => array(),
				'src'	 => array(),
				'width'	 => array(),
			),
			'li'							 => array(
				'class' => array(),
			),
			'ol'							 => array(
				'class' => array(),
			),
			'p'								 => array(
				'class' => array(),
			),
			'q'								 => array(
				'cite'	 => array(),
				'title'	 => array(),
			),
			'span'							 => array(
				'class'	 => array(),
				'title'	 => array(),
				'style'	 => array(),
			),
			'iframe'						 => array(
				'width'			 => array(),
				'height'		 => array(),
				'scrolling'		 => array(),
				'frameborder'	 => array(),
				'allow'			 => array(),
				'src'			 => array(),
			),
			'strike'						 => array(),
			'br'							 => array(),
			'strong'						 => array(),
			'data-wow-duration'				 => array(),
			'data-wow-delay'				 => array(),
			'data-wallpaper-options'		 => array(),
			'data-stellar-background-ratio'	 => array(),
			'ul'							 => array(
				'class' => array(),
			),
		);

		return  $allowed_tags;
	}

	public static function kspan($text){
		return str_replace(['{', '}'], ['<span>', '</span>'], self::kses($text));
	}


	public static function trim_words($text, $num_words){
		return wp_trim_words( $text, $num_words, '' );
	}

	public static function array_push_assoc($array, $key, $value){
		$array[$key] = $value;
		return $array;
	}

	public static function render($content){
		if (stripos($content, "metform-has-lisence") !== false) {
			return null;
		}

		return $content;
	}
	
	public static function render_elementor_content($content_id){
		$elementor_instance = \Elementor\Plugin::instance();
		return $elementor_instance->frontend->get_builder_content_for_display( $content_id );
	}

	public static function img_meta($id){
		$attachment = get_post($id);
		if($attachment == null || $attachment->post_type != 'attachment'){
			return null;
		}
		return [
            'alt' => get_post_meta( $attachment->ID, '_wp_attachment_image_alt', true ),
            'caption' => $attachment->post_excerpt,
            'description' => $attachment->post_content,
            'href' => get_permalink( $attachment->ID ),
            'src' => $attachment->guid,
            'title' => $attachment->post_title
		];
	}

	public static function render_inner_content($content, $id){
		return str_replace('.elementor-'.$id.' ', '#elementor .elementor-'.$id.' ', $content);
	}

	public static function mfConvertStyleToReactObj($content){

		preg_match_all(' /style=("|\')(.*?)("|\')/', $content, $match);
		if(isset($match) && !empty($match ) && count($match) <= 0) { return $content; }
		$exception_styled_property_names = [
			'--divider-pattern-url'
		];

		foreach ($match[2] as $item) {  
			 
			$styleData = [];

			$is_matched_found = false;
			foreach($exception_styled_property_names as $property_name){
				if (strpos($item, $property_name) !== FALSE) { 
					if($property_name === '--divider-pattern-url'){
						$is_matched_found = true;
						$styleData['--divider-pattern-url'] = rtrim(trim(str_replace('--divider-pattern-url:', '', html_entity_decode($item, ENT_QUOTES))), ';');
					}					
				}
			}

			if(!$is_matched_found){
				$styles = explode(';', $item);
				if(isset($styles) && !empty($styles )){
					foreach($styles as $style){
						$split = explode(':', $style);
						$key = isset($split[0]) ? trim($split[0]) : '';
						$value = isset($split[1]) ? trim($split[1]) : '';
						if(strlen($key) > 0 && strlen($value)){
							$styleData["$key"] = $value;
						}
					}
				}
			}
			$newStyledData = '';
			if(!empty($styleData)){
				$newStyledData .= "{ ";
				foreach($styleData as $key => $value){
					$value = addslashes($value);
					$newStyledData .= "'$key': '{$value}',";
				}
				$newStyledData .= " }";
			}
			//* Replace the old style with new style that capable of react
			$replaceStyle = (isset($newStyledData) && !empty($newStyledData )) ? 'style=${' . $newStyledData . '}' : '';
			$content = preg_replace(array('[style=("|\')('. preg_quote($item) .')("|\')]'), $replaceStyle, $content);
		}

		$modified = str_replace('<style>','<style key="1">',$content);
		return str_replace('data-elementor-type="wp-post"','data-elementor-type="wp-post" key="2"',$modified);
	}
	/**
	 * Robust detection for Elementor edit/preview contexts.
	 * Accounts for editor iframe, preview and request query args.
	 *
	 * @return bool
	 */
	public static function detect_elementor_edit_context() {
		try {
			if ( class_exists( '\\Elementor\\Plugin' ) ) {
				$plugin = \Elementor\Plugin::instance();
				// Native editor mode
				if ( isset( $plugin->editor ) && method_exists( $plugin->editor, 'is_edit_mode' ) && $plugin->editor->is_edit_mode() ) {
					return true;
				}
				// Preview frame inside editor
				if ( isset( $plugin->preview ) && method_exists( $plugin->preview, 'is_preview_mode' ) && $plugin->preview->is_preview_mode() ) {
					return true;
				}
			}

		} catch ( \Throwable $e ) {
			// Silently ignore, default false.
		}
		return false;
	}
	public static function render_form_content($form, $widget_id){
		$rest_url = get_rest_url();
		$form_unique_name = (is_numeric($form)) ? ($widget_id.'-'.$form) : $widget_id;
		$form_id = (is_numeric($form)) ? $form : $widget_id;
		$form_settings = \MetForm\Core\Forms\Action::instance()->get_all_data($form_id);

		$site_key = !empty($form_settings['mf_recaptcha_site_key']) ?  $form_settings['mf_recaptcha_site_key'] : '';

		$form_type = isset($form_settings['form_type']) ? $form_settings['form_type'] : 'contact_form';
		if(!empty($form_settings['mf_recaptcha_version'])) {
			if($form_settings['mf_recaptcha_version'] == 'recaptcha-v3') {
				$site_key = $form_settings['mf_recaptcha_site_key_v3'];
			} 
		}

		// Detect Elementor edit context
		 $is_edit_mode = self::detect_elementor_edit_context();	
		if (!$is_edit_mode && isset($form_settings['form_scheduling_status']) && (!empty($form_settings['mf_scheduling_submission_starts']) || !empty($form_settings['mf_scheduling_submission_ends']))) {
            $current_ts = current_time('timestamp');
            $start_time = $form_settings['mf_scheduling_submission_starts'] ?? '';
            $end_time   = $form_settings['mf_scheduling_submission_ends'] ?? '';

            $waiting_message = $form_settings['mf_scheduling_form_waiting_message'] 
                                ?? 'Form submission has not started yet.';
            $expired_message = $form_settings['mf_scheduling_form_expired_message'] 
                                ?? 'Form submission is now closed.';

            $start_ts = $start_time ? strtotime(str_replace('T', ' ', $start_time)) : 0;
            $end_ts   = $end_time   ? strtotime(str_replace('T', ' ', $end_time))   : 0;
            if ($start_ts && $current_ts < $start_ts) {
				return '<div class="mf-form-scheduling-message mf-form-waiting">'.esc_html($waiting_message).'</div>';
            }elseif ($end_ts && $current_ts > $end_ts) {
				return '<div class="mf-form-scheduling-message mf-form-expired">'.esc_html($expired_message).'</div>';
            }
        }		
		ob_start();
		?>

		<div
			id="metform-wrap-<?php echo esc_attr( $form_unique_name ); ?>"
			class="mf-form-wrapper"
			data-form-id="<?php echo esc_attr( $form_id ); ?>"
			data-action="<?php echo esc_attr($rest_url. "metform/v1/entries/insert/" .$form_id); ?>"
			data-wp-nonce="<?php echo esc_attr(wp_create_nonce( 'wp_rest' )); ?>"
			data-form-nonce="<?php echo esc_attr(wp_create_nonce( 'form_nonce' )); ?>"
			data-quiz-summery = "<?php echo (!empty($form_settings['quiz_summery']) && class_exists('\MetForm_Pro\Base\Package')) ? "true" : "false"; ?>"
			data-save-progress = "<?php echo (isset($form_settings['mf_save_progress']) && $form_settings['mf_save_progress'] && class_exists('\MetForm_Pro\Base\Package')) ? "true" : "false"; ?>"
			data-form-type="<?php echo esc_attr($form_type); ?>"
			data-stop-vertical-effect="<?php echo esc_attr(isset($form_settings['mf_stop_vertical_scrolling']) ? $form_settings['mf_stop_vertical_scrolling'] : '') ?>"
			data-payment-submit-before="<?php echo esc_attr(isset($form_settings['mf_payment_submit_before_payment']) ? $form_settings['mf_payment_submit_before_payment'] : '0') ?>"
			></div>


		<!----------------------------- 
			* controls_data : find the the props passed indie of data attribute
			* props.SubmitResponseMarkup : contains the markup of error or success message
			* https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals
		--------------------------- -->

		<?php $is_edit_mode = \Elementor\Plugin::$instance->editor->is_edit_mode();	?>
		<script type="text/mf" class="mf-template">
			function controls_data (value){
				let currentWrapper = "mf-response-props-id-<?php echo esc_attr( $form_id ); ?>";
				let currentEl = document.getElementById(currentWrapper);
				
				return currentEl ? currentEl.dataset[value] : false
			}


			let is_edit_mode = '<?php echo esc_attr( $is_edit_mode );?>' ? true : false;
			let message_position = controls_data('messageposition') || 'top';

			
			let message_successIcon = controls_data('successicon') || '';
			let message_errorIcon = controls_data('erroricon') || '';
			let message_editSwitch = controls_data('editswitchopen') === 'yes' ? true : false;
			let message_proClass = controls_data('editswitchopen') === 'yes' ? 'mf_pro_activated' : '';
			
			let is_dummy_markup = is_edit_mode && message_editSwitch ? true : false;

			
			return html`
				<form
					className="metform-form-content"
					ref=${parent.formContainerRef}
					onSubmit=${ validation.handleSubmit( parent.handleFormSubmit ) }
				
					>
			
			
					${is_dummy_markup ? message_position === 'top' ?  props.ResponseDummyMarkup(message_successIcon, message_proClass) : '' : ''}
					${is_dummy_markup ? ' ' :  message_position === 'top' ? props.SubmitResponseMarkup`${parent}${state}${message_successIcon}${message_errorIcon}${message_proClass}` : ''}

					<!--------------------------------------------------------
					*** IMPORTANT / DANGEROUS ***
					${html``} must be used as in immediate child of "metform-form-main-wrapper"
					class otherwise multistep form will not run at all
					---------------------------------------------------------->

					<div className="metform-form-main-wrapper" key=${'hide-form-after-submit'} ref=${parent.formRef}>
					${html`
						<?php
							$replaceStrings = array(
								'from' => array(
									'class=',
									'for=',
									'cellspacing=',
									'cellpadding=',
									'srcset',
									'colspan',
									'<script>',			// Script Start Tag
									'</script>',		// Script End Tag
									'<br>',
									'<BR>'
								),
								'to' => array(
									'className=',
									'htmlFor=',
									'cellSpacing=',
									'cellPadding=',
									'srcSet',
									'colSpan',
									'${(function(){',	// Script Start Tag
									'})()}',			// Script End Tag
									'<br/>',
									'<br/>'
								),
							);
							$form_content = is_numeric( $form ) ? \MetForm\Utils\Util::render_elementor_content( $form ) : $form;
							$form_content = \MetForm\Utils\Util::mfConvertStyleToReactObj($form_content);
							$form_content = str_replace( $replaceStrings['from'], $replaceStrings['to'], $form_content );
							$form_content = preg_replace( '/<!--(.|\s)*?-->/', '', $form_content ); // Removes HTML Comments
							echo $form_content; //phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- ignore this because of if escape this content does not append in preview and frontend.
						?>
					`}
					</div>

					${is_dummy_markup ? message_position === 'bottom' ? props.ResponseDummyMarkup(message_successIcon, message_proClass) : '' : ''}
					${is_dummy_markup ? ' ' : message_position === 'bottom' ? props.SubmitResponseMarkup`${parent}${state}${message_successIcon}${message_errorIcon}${message_proClass}` : ''}
				
				</form>
			`
		</script>

		<?php
		$output = ob_get_contents();
		ob_end_clean();

		return $output;
	}

	public static function add_param_url($url, $key, $value) {
	
		$url = preg_replace('/(.*)(?|&)'. $key .'=[^&]+?(&)(.*)/i', '$1$2$4', $url .'&');
		$url = substr($url, 0, -1);
		
		if (strpos($url, '?') === false) {
			return ($url .'?'. $key .'='. $value);
		} else {
			return ($url .'&'. $key .'='. $value);
		}
	}

	public static function get_form_settings($key){
		$options = get_option('metform_option__settings');
		return isset($options[$key]) ? $options[$key] : '';
	}
	public static function metform_content_renderer($content){
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo $content;
	}

	/**
     * Convert a abs path to a URL. 
     *
     * @since 3.2.0
     * @access public
     */
	public static function abs_path_to_url( $path = '' ) {
		$url = str_replace(
			wp_normalize_path( untrailingslashit( ABSPATH ) ),
			site_url(),
			wp_normalize_path( $path )
		);
		return esc_url_raw( $url );
	}

	public static function permalink_setup(){
        if( current_user_can('manage_options') ) {
            if(isset($_GET['permalink']) && $_GET['permalink'] == 'post' && isset($_GET['_wpnonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['_wpnonce'])))){
				self::change_permalink();
			}
            if(get_option('rewrite_rules') =='' && !isset($_GET['permalink'])){    
                $message = sprintf(esc_html__('Plain permalink is not supported with MetForm. We recommend to use post name as your permalink settings.', 'metform'));
                \Oxaim\Libs\Notice::instance('metform', 'unsupported-permalink')
                ->set_type('warning')
                ->set_message($message)
                ->set_button([
                    'url'   => wp_nonce_url(self_admin_url('options-permalink.php?permalink=post')),
                    'text'  => esc_html__('Change Permalink','metform'),
                    'class' => 'button-primary',
                ])
                ->call();
            }
        }
    }

	public static function change_permalink(){
			global $wp_rewrite; 
			$wp_rewrite->set_permalink_structure('/%postname%/'); 
			
			//Set the option
			update_option( "rewrite_rules", false ); 
			
			//Flush the rules and tell it to write htaccess
			$wp_rewrite->flush_rules( true );

			add_action('admin_notices', array( self::class, 'permalink_structure_update_notice'));
	}
	public static function permalink_structure_update_notice() {
		if ( !current_user_can('manage_options') ) {
			return;
		}
        ?>
        <div class="notice notice-success is-dismissible">
            <p><b><?php esc_html_e( 'Permalink Structure Updated!', 'metform' ); ?></b></p>
        </div>
        <?php
    } 

	public static function banner_consent(){
		include_once "user-consent-banner/consent-check-view.php";
	}

	/**
	 * Check if any form is using a specific feature and save the usage data.
	 * Once a user uses a feature, it will be tracked and remain free for them.
	 * All feature usage data is stored in a single option table with key-value pairs.
	 * 
	 * @param string $setting_key The feature setting key to check
	 * @return bool True if at least one form has the feature enabled or was previously used, false otherwise.
	 */
	public static function is_using_feature( $setting_key ){
		// Get all feature usage data from single option
		$feature_usage_data = get_option('metform_feature_usage', array());
		
		// Check if this feature was already used before
		if (isset($feature_usage_data[$setting_key]) && 
			isset($feature_usage_data[$setting_key]['used']) &&
			($feature_usage_data[$setting_key]['used'] === '1' || $feature_usage_data[$setting_key]['used'] === 1)) {
			return true;
		}
		
		// Get all metform forms
		$forms = get_posts([
			'post_type' => 'metform-form',
			'post_status' => 'publish',
			'numberposts' => -1,
			'fields' => 'ids' // Only get IDs for performance
		]);

		if (empty($forms)) {
			return false;
		}

		// Check each form's settings for the feature
		foreach ($forms as $form_id) {
			$form_settings = get_post_meta($form_id, 'metform_form__form_setting', true);
			
			// Check if the feature is enabled (value should be '1' or 1)
			if (isset($form_settings[$setting_key]) && 
				($form_settings[$setting_key] === '1' || $form_settings[$setting_key] === 1)) {
				
				// Save to options table that this feature has been used with timestamp
				$feature_usage_data[$setting_key] = array(
					'used' => '1',
					'last_used' => current_time('mysql'),
					'timestamp' => time()
				);
				update_option('metform_feature_usage', $feature_usage_data);
				
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if the current license tier is Free.
	 * 
	 * @return bool True if the current tier is Free, false otherwise.
	 */
	public static function is_free_tier() {
		$package_info = get_option('__mf_package_info__', 'free');
		return $package_info === 'free';
	}

	/**
	 * Check if the current license tier is Starter.
	 * 
	 * @return bool True if the current tier is Starter, false otherwise.
	 */
	public static function is_starter(){
		$package_info = get_option('__mf_package_info__');
		return $package_info === 'starter';
	}

	/**
	 * Check if the current license tier is Mid.
	 * 
	 * @return bool True if the current tier is Mid, false otherwise.
	 */
	public static function is_mid_tier() {
		$package_info = get_option('__mf_package_info__');
		return $package_info === 'mid';
	}

	/**
	 * Check if the current license tier is Top.
	 * 
	 * @return bool True if the current tier is Top, false otherwise.
	 */
	public static function is_top_tier() {
		$package_info = get_option('__mf_package_info__');
		return $package_info === 'top';
	}

	public static function mf_pro_alert_notice( $params = array() ) {
		?>
		<div class="mf-pro-alert">
			<div class="pro-content">
				<h5 class="alert-heading"><?php echo isset( $params['heading'] ) && ! empty( $params['heading'] ) ? esc_html( $params['heading'] ) : 'You are currently using MetForm free version.'; ?></h5>
				<p class="alert-description"><?php echo isset( $params['description'] ) && ! empty( $params['description'] ) ? esc_html( $params['description'] ) : 'Get full access to premium features by upgrading today.'; ?></p>
			</div>
			<div class="pro-btn">
				<a href="https://wpmet.com/plugin/metform/pricing/" target="_blank"> <svg xmlns="http://www.w3.org/2000/svg" width="13" height="14" viewBox="0 0 13 14" fill="none">
						<path d="M10.6 6.40002H2.2C1.53726 6.40002 1 6.93728 1 7.60002V11.8C1 12.4628 1.53726 13 2.2 13H10.6C11.2627 13 11.8 12.4628 11.8 11.8V7.60002C11.8 6.93728 11.2627 6.40002 10.6 6.40002Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
						<path d="M3.40039 6.4V4C3.40039 3.20435 3.71646 2.44129 4.27907 1.87868C4.84168 1.31607 5.60474 1 6.40039 1C7.19604 1 7.9591 1.31607 8.52171 1.87868C9.08432 2.44129 9.40039 3.20435 9.40039 4V6" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg> Upgrade </a>
			</div>
		</div>

		<?php
	}

	/**
	 * Check if a specific settings option is being used.
	 * 
	 * @param string $settings_key The settings key to check
	 * @return bool True if the settings option is being used, false otherwise.
	 */
	public static function is_using_settings_option( $settings_key ) {
		$settings = get_option( 'metform_option__settings', array() );
		return isset( $settings[ $settings_key ] );
	}

	/**
	 * Check if the user is an old pro user by checking usage of specific features.
	 * 
	 * @return bool True if the user is an old pro user, false otherwise.
	 */
	public static function is_used_any_feature(){

		$using_from_modal = [
			'require_login',
			'capture_user_browser_data',
			'limit_total_entries_status',
			'count_views',
			'mf_stop_vertical_scrolling',
			'enable_user_notification',
			'user_email_attach_submission_copy',
			'mf_slack',
			'mf_rest_api',
			'mf_mail_aweber',
			'mf_zapier',
			'mf_paypal',
			'mf_stripe',
			'mf_zoho',
			'quiz_summery',
			'mf_redirect_params_status',
			'mf_conditional_redirect_status',
			'email_verification_enable',
			'mf_google_sheet',
			'mf_mail_poet'
		];

		$using_from_settings = [
			'mf_mailchimp_api_key',
			'mf_ckit_api_key',
			'mf_get_response_api_key',
			'mf_active_campaign_api_key',
			'mf_paypal_email',
			'mf_stripe_live_publishiable_key',
			'mf_stripe_test_secret_key',
			'mf_zoho_data_center',
			'mf_save_progress',
			'mf_field_name_show',
			'mf_enable_entry_file_delete',
			'mf_google_map_api_key',
			'met_form_aweber_mail_access_token_key',
			'mf_google_sheet_client_id',
			'mf_google_sheet_client_secret',
			'mf_helpscout_app_id',
			'mf_helpscout_app_secret'
		];

		foreach ( $using_from_modal as $setting_key ) {
			if ( self::is_using_feature( $setting_key ) ) {
				return true;
			}
		}

		foreach ( $using_from_settings as $setting_key ) {
			if ( self::is_using_settings_option( $setting_key ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Metform pro version since 3.9.5 we are tracking old pro users and new pro users for tier separation.
	 * 
	 * @return void/bool
	 */
	public static function is_old_pro_user(){

		$payment_id = get_option('__mf_payment_id__', false);

		if( $payment_id && $payment_id < 235393 ){
			return true;
		}

		return false;
	}

	public static function country_list()
    {
        return [
            'af' => 'Afghanistan',
            'al' => 'Albania',
            'dz' => 'Algeria',
            'ad' => 'Andorra',
            'ao' => 'Angola',
            'ag' => 'Antigua and Barbuda',
            'ar' => 'Argentina',
            'am' => 'Armenia',
            'aw' => 'Aruba',
            'au' => 'Australia',
            'at' => 'Austria',
            'az' => 'Azerbaijan',
            'bs' => 'Bahamas',
            'bh' => 'Bahrain',
            'bd' => 'Bangladesh',
            'bb' => 'Barbados',
            'by' => 'Belarus',
            'be' => 'Belgium',
            'bz' => 'Belize',
            'bj' => 'Benin',
            'bt' => 'Bhutan',
            'bo' => 'Bolivia',
            'ba' => 'Bosnia and Herzegovina',
            'bw' => 'Botswana',
            'br' => 'Brazil',
            'io' => 'British Indian Ocean Territory',
            'bn' => 'Brunei',
            'bg' => 'Bulgaria',
            'bf' => 'Burkina Faso',
            'bi' => 'Burundi',
            'kh' => 'Cambodia',
            'cm' => 'Cameroon',
            'ca' => 'Canada',
            'cv' => 'Cape Verde',
            'bq' => 'Caribbean Netherlands',
            'cf' => 'Central African Republic',
            'td' => 'Chad',
            'cl' => 'Chile',
            'cn' => 'China',
            'co' => 'Colombia',
            'km' => 'Comoros',
            'cd' => 'Congo',
            'cg' => 'Congo',
            'cr' => 'Costa Rica',
			'ci' => 'Côte d’Ivoire',
            'hr' => 'Croatia',
            'cu' => 'Cuba',
            'cw' => 'Curaçao',
            'cy' => 'Cyprus',
            'cz' => 'Czech Republic',
            'dk' => 'Denmark',
            'dj' => 'Djibouti',
            'dm' => 'Dominica',
            'do' => 'Dominican Republic',
            'ec' => 'Ecuador',
            'eg' => 'Egypt',
            'sv' => 'El Salvador',
            'gq' => 'Equatorial Guinea',
            'er' => 'Eritrea',
            'ee' => 'Estonia',
            'et' => 'Ethiopia',
            'fj' => 'Fiji',
            'fi' => 'Finland',
            'fr' => 'France',
            'gf' => 'French Guiana',
            'pf' => 'French Polynesia',
            'ga' => 'Gabon',
            'gm' => 'Gambia',
            'ge' => 'Georgia',
            'de' => 'Germany',
            'gh' => 'Ghana',
            'gr' => 'Greece',
            'gd' => 'Grenada',
            'gp' => 'Guadeloupe',
            'gu' => 'Guam',
            'gt' => 'Guatemala',
            'gn' => 'Guinea',
            'gw' => 'Guinea-Bissau',
            'gy' => 'Guyana',
            'ht' => 'Haiti',
            'hn' => 'Honduras',
            'hk' => 'Hong Kong',
            'hu' => 'Hungary',
            'is' => 'Iceland',
            'in' => 'India',
            'id' => 'Indonesia',
            'ir' => 'Iran',
            'iq' => 'Iraq',
            'ie' => 'Ireland',
            'il' => 'Israel',
            'it' => 'Italy',
            'jm' => 'Jamaica',
            'jp' => 'Japan',
            'jo' => 'Jordan',
            'kz' => 'Kazakhstan',
            'ke' => 'Kenya',
            'ki' => 'Kiribati',
            'xk' => 'Kosovo',
            'kw' => 'Kuwait',
            'kg' => 'Kyrgyzstan',
            'la' => 'Laos',
            'lv' => 'Latvia',
            'lb' => 'Lebanon',
            'ls' => 'Lesotho',
            'lr' => 'Liberia',
            'ly' => 'Libya',
            'li' => 'Liechtenstein',
            'lt' => 'Lithuania',
            'lu' => 'Luxembourg',
            'mo' => 'Macau',
            'mk' => 'Macedonia',
            'mg' => 'Madagascar',
            'mw' => 'Malawi',
            'my' => 'Malaysia',
            'mv' => 'Maldives',
            'ml' => 'Mali',
            'mt' => 'Malta',
            'mh' => 'Marshall Islands',
            'mq' => 'Martinique',
            'mr' => 'Mauritania',
            'mu' => 'Mauritius',
            'mx' => 'Mexico',
            'fm' => 'Micronesia',
            'md' => 'Moldova',
            'mc' => 'Monaco',
            'mn' => 'Mongolia',
            'me' => 'Montenegro',
            'ma' => 'Morocco',
            'mz' => 'Mozambique',
            'mm' => 'Myanmar',
            'na' => 'Namibia',
            'nr' => 'Nauru',
            'np' => 'Nepal',
            'nl' => 'Netherlands',
            'nc' => 'New Caledonia',
            'nz' => 'New Zealand',
            'ni' => 'Nicaragua',
            'ne' => 'Niger',
            'ng' => 'Nigeria',
            'kp' => 'North Korea',
            'no' => 'Norway',
            'om' => 'Oman',
            'pk' => 'Pakistan',
            'pw' => 'Palau',
            'ps' => 'Palestine',
            'pa' => 'Panama',
            'pg' => 'Papua New Guinea',
            'py' => 'Paraguay',
            'pe' => 'Peru',
            'ph' => 'Philippines',
            'pl' => 'Poland',
            'pt' => 'Portugal',
            'pr' => 'Puerto Rico',
            'qa' => 'Qatar',
            're' => 'Réunion',
            'ro' => 'Romania',
            'ru' => 'Russia',
            'rw' => 'Rwanda',
            'kn' => 'Saint Kitts and Nevis',
            'lc' => 'Saint Lucia',
            'vc' => 'Saint Vincent and the Grenadines',
            'ws' => 'Samoa',
            'sm' => 'San Marino',
            'st' => 'São Tomé and Príncipe',
            'sa' => 'Saudi Arabia',
            'sn' => 'Senegal',
            'rs' => 'Serbia',
            'sc' => 'Seychelles',
            'sl' => 'Sierra Leone',
            'sg' => 'Singapore',
            'sk' => 'Slovakia',
            'si' => 'Slovenia',
            'sb' => 'Solomon Islands',
            'so' => 'Somalia',
            'za' => 'South Africa',
            'kr' => 'South Korea',
            'ss' => 'South Sudan',
            'es' => 'Spain',
            'lk' => 'Sri Lanka',
            'sd' => 'Sudan',
            'sr' => 'Suriname',
            'sz' => 'Swaziland',
            'se' => 'Sweden',
            'ch' => 'Switzerland',
            'sy' => 'Syria',
            'tw' => 'Taiwan',
            'tj' => 'Tajikistan',
            'tz' => 'Tanzania',
            'th' => 'Thailand',
            'tl' => 'Timor-Leste',
            'tg' => 'Togo',
            'to' => 'Tonga',
            'tt' => 'Trinidad and Tobago',
            'tn' => 'Tunisia',
            'tr' => 'Turkey',
            'tm' => 'Turkmenistan',
            'tv' => 'Tuvalu',
            'ug' => 'Uganda',
            'ua' => 'Ukraine',
            'ae' => 'United Arab Emirates',
            'gb' => 'United Kingdom',
            'us' => 'United States',
            'uy' => 'Uruguay',
            'uz' => 'Uzbekistan',
            'vu' => 'Vanuatu',
            'va' => 'Vatican City',
            've' => 'Venezuela',
            'vn' => 'Vietnam',
            'ye' => 'Yemen',
            'zm' => 'Zambia',
            'zw' => 'Zimbabwe',
        ];
    }

	/**
	 * Integration settings keys for checking if an integration is already in use.
	 * Used for grandfathering existing pro users who already use specific integrations.
	 */
	private static $integration_settings_keys = array(
		'mailchimp' => 'mf_mailchimp_api_key',
		'aweber' => 'met_form_aweber_mail_access_token_key',
		'activecampaign' => 'mf_active_campaign_api_key',
		'getresponse' => 'mf_get_response_api_key',
		'convertkit' => 'mf_ckit_api_key',
	);

	/**
	 * Check if a specific integration is already in use (for existing pro user access).
	 * 
	 * @param string $integration_key The integration key to check
	 * @return bool True if the integration is in use, false otherwise.
	 */
	public static function is_integration_in_use($integration_key) {
		if (isset(self::$integration_settings_keys[$integration_key])) {
			return self::is_using_settings_option(self::$integration_settings_keys[$integration_key]);
		}
		return false;
	}

	/**
	 * Check if user has access to a specific tier.
	 * 
	 * @param string $required_tier - 'free', 'pro', 'mid', 'top'
	 * @return bool True if user has access to the tier, false otherwise.
	 */
	public static function has_tier_access($required_tier) {
		switch ($required_tier) {
			case 'free':
				return true;
			case 'pro':
				return class_exists('\MetForm_Pro\Base\Package');
			case 'mid':
				return self::is_mid_tier() || self::is_top_tier();
			case 'top':
				return self::is_top_tier();
			default:
				return false;
		}
	}

	/**
	 * Check if user should have restricted access to an integration.
	 * 
	 * Logic:
	 * 1. Free tier - always accessible
	 * 2. Has required tier access - accessible
	 * 3. For EXISTING features (existing_pro_user_access = true):
	 *    - Old pro users (before tier system) get access
	 *    - Pro users already using this integration keep access
	 * 4. For NEW features (existing_pro_user_access = false):
	 *    - Only tier check applies
	 *    - Old pro users and existing users do NOT get automatic access
	 * 
	 * @param array $integration - Integration config with 'required_tier' and 'existing_pro_user_access'
	 * @param string $integration_key - Integration key
	 * @return bool - true if access should be restricted, false if accessible
	 */
	public static function should_restrict_integration_access($integration, $integration_key) {
		$required_tier = $integration['required_tier'] ?? 'free';
		$existing_pro_user_access = $integration['existing_pro_user_access'] ?? false;
		$pro_exists = class_exists('\MetForm_Pro\Base\Package');
		
		// Free tier - always accessible
		if ($required_tier === 'free') {
			return false;
		}
		
		// Check if user has the required tier access
		if (self::has_tier_access($required_tier)) {
			return false;
		}
		
		// For existing features (existing_pro_user_access = true):
		// - Old pro users get access to all existing pro features
		// - Existing pro users who were already using this integration keep access
		// For new features (existing_pro_user_access = false):
		// - Only tier check applies, no legacy support
		if ($existing_pro_user_access) {
			// Old pro users get access to all existing pro features (before tier system was introduced)
			if ($pro_exists && self::is_old_pro_user()) {
				return false;
			}
			
			// Allow existing pro users who were already using this integration before tier changes
			if ($pro_exists && self::is_integration_in_use($integration_key)) {
				return false;
			}
		}
		
		// User doesn't have access
		return true;
	}

	/**
	 * Get upgrade tooltip text based on required tier.
	 * 
	 * @param string $required_tier - 'pro', 'mid', 'top'
	 * @return string The tooltip text
	 */
	public static function get_upgrade_tooltip($required_tier) {
		$pro_exists = class_exists('\MetForm_Pro\Base\Package');
		
		if (!$pro_exists) {
			return 'Upgrade for premium access.';
		}
		
		switch ($required_tier) {
			case 'top':
				return 'Get access by upgrading to MetForm Agency plan.';
			case 'mid':
				return 'Get access by upgrading to MetForm Professional plan.';
			default:
				return 'Upgrade for premium access.';
		}
	}


	public static function is_plugin_active( $plugin_file ) {
		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		return function_exists( 'is_plugin_active' ) ? is_plugin_active( $plugin_file ) : false;
	}
}
