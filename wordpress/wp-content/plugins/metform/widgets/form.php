<?php
namespace Elementor;

use \MetForm\Controls\Controls_Manager as MetForm_Controls_Manager;

defined( 'ABSPATH' ) || exit;

class Widget_Met_Form extends Widget_Base {
	use \MetForm\Widgets\Widget_Notice;


	public function __construct($data = [], $args = null)
	{
		parent::__construct($data, $args);
		$this->add_style_depends('metform-ui');
		$this->add_style_depends('metform-style');
		$this->add_script_depends('htm');
		$this->add_script_depends('metform-app');
		$this->add_script_depends('mf-widget-frontend');
	}

	public function get_name() {
		return 'metform';
    }

	public function get_icon() {
		return 'mf-widget-icon icon-metform_favicon';
	}
    
	public function get_title() {
		return esc_html__( 'MetForm', 'metform' );
	}

	public function has_widget_inner_wrapper(): bool {
		return ! Plugin::$instance->experiments->is_feature_active('e_optimized_markup');
	}

	public function show_in_panel() {
        return 'metform-form' != get_post_type();
	}

	public function get_categories() {
		return [ 'metform' ];
	}

	public function get_keywords() {
        return ['metform', 'form'];
	}

	
	protected function register_controls() {
		
        $this->start_controls_section(
			'content_section',
			[
				'label' => esc_html__( 'Form', 'metform' ),
				'tab' => Controls_Manager::TAB_CONTENT,
			]
		);
		$this->add_control(
            'important_note',
            [
                'label' => '',
                'type' => \Elementor\Controls_Manager::RAW_HTML,
				'raw' => sprintf(
					'<div class="mf-important-note">%s <a href="%s" target="_blank"><u>%s</u></a></div> <button class="mf-edit-form">'
					. '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
					. '<path d="M10.95 3.07006L11.61 2.41007C12.1568 1.86331 13.0432 1.86331 13.59 2.41007C14.1367 2.95683 14.1367 3.84329 13.59 4.39005L12.93 5.05004M10.95 3.07006L6.51043 7.5096C6.17209 7.848 5.93207 8.27187 5.81602 8.73607L5.33337 10.6667L7.26397 10.184C7.72817 10.068 8.15204 9.82793 8.49044 9.4896L12.93 5.05004M10.95 3.07006L12.93 5.05004" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>'
					. '<path d="M12.6666 9.00016C12.6666 11.1918 12.6666 12.2876 12.0613 13.0252C11.9505 13.1602 11.8267 13.284 11.6917 13.3948C10.9541 14.0002 9.85827 14.0002 7.6666 14.0002H7.33333C4.81917 14.0002 3.56211 14.0002 2.78106 13.2191C2.00002 12.4381 2 11.181 2 8.66683V8.3335C2 6.14184 2 5.04602 2.60529 4.30846C2.71611 4.17343 2.83993 4.04961 2.97496 3.93879C3.71253 3.3335 4.80835 3.3335 7 3.3335" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
					. '</svg> %s </button>',
					esc_html__('See this video tutorial how to use metform.', 'metform'),
					esc_url('https://youtu.be/8R4-Q14cu-w'),
					esc_html__('Click here', 'metform'),
					esc_html__('Edit Form', 'metform')
				),
            ]
		);
		
		$this->add_control(
			'mf_form_id',
			[
				'label' => esc_html__( 'Select Form: ', 'metform' ),
				'type' => MetForm_Controls_Manager::FORMPICKER,
				'default' => '',
			]
		);
		
		$this->end_controls_section();
		$this->insert_pro_message();
	}

	protected function render( $instance = [] ) {
		$settings = $this->get_settings_for_display();
		$nav = !isset($settings['mf_form_multistep_display_nav']) ? '' : ' mf-form-multistep-nav-'.$settings['mf_form_multistep_display_nav'];
		$direction = !isset($settings['mf_form_multistep_slide_direction']) ? '' : ' mf_slide_direction_'. $settings['mf_form_multistep_slide_direction'];
		$form_data = json_decode($settings['mf_form_id'], true);


		// take the value when metform-pro is activated
		if(in_array('metform-pro/metform-pro.php', apply_filters('active_plugins', get_option('active_plugins')))):
			$message_display_position	= isset($settings['mf_response_display_position']) ? $settings['mf_response_display_position'] : '';
			$message_success_icon		= isset($settings['mf_success_icon']['value']) ? $settings['mf_success_icon']['value'] : '';
			$message_error_icon			= isset($settings['mf_error_icon']['value']) ? $settings['mf_error_icon']['value'] : '';
			$message_edit_switch		= isset($settings['mf_success_controls']) ? $settings['mf_success_controls'] : '' ;
		
		// pass default value while metfomr-pro is not activated
		else:
			$message_display_position	= 'top';
			$message_success_icon		= 'fas fa-check';
			$message_error_icon			= 'fas fa-exclamation-triangle';
			$message_edit_switch		= false;

		endif;

		if(is_array($form_data) && isset($form_data['id'])){
			unset($settings['mf_form_id']);
			$form_id = explode('***', $form_data['id']);
			$form_id = $form_id[0];

			$ffarg = get_posts([
				'numberposts'	=> 1,
				'p'         	=> $form_id,
				'post_type' 	=> 'metform-form'
			]);

			$ffarg = (!empty($ffarg) ? $ffarg : get_posts([
				'numberposts'	=> 1,
				'post_type' 	=> 'metform-form',
				'meta_key'		=> '_metform_cloned_id',
				'meta_value'	=> 'template-' . $form_id,
			]));

			if(empty($ffarg) && isset($form_data['data'])){
				$form_id = \MetForm\Core\Forms\Builder::instance()->create_form('', $form_id, 
					(isset($form_data['data'][0]) ? $form_data['data'][0] : '')
				);
				unset($form_data);
			}else{
				$form_id = $ffarg[0]->ID;
			}
		}else{			

			$form_id = explode('***', $settings['mf_form_id']);
			$form_id = $form_id[0];
		}

		$response_type = !empty($settings['mf_response_type']) ? $settings['mf_response_type'] : 'alert';

		echo '<div id="mf-response-props-id-'. esc_attr($form_id) .'" data-previous-steps-style="'. (!isset($settings['mf_form_previous_steps_style']) ? '' : esc_attr($settings['mf_form_previous_steps_style'])) .'" data-editswitchopen="'. esc_attr($message_edit_switch) .'" data-response_type="'. esc_attr($response_type) .'" data-erroricon="'. esc_attr($message_error_icon)  .'" data-successicon="'. esc_attr($message_success_icon) .'" data-messageposition="'. esc_attr($message_display_position) .'" class=" ' . esc_attr($direction .' '. (!isset($settings['mf_form_multistep_status']) ? '' : $settings['mf_form_multistep_status']) . $nav .' mf-scroll-top-'. ( (!empty($settings['mf_step_scroll_top']) && 'yes' == $settings['mf_step_scroll_top']) ? ($settings['mf_step_scroll_top']) : 'no' )) .'">';
			\MetForm\Utils\Util::metform_content_renderer(\MetForm\Controls\Form_Picker_Utils::parse($form_id , $this->get_id()));
		echo '</div>';
	}
}
