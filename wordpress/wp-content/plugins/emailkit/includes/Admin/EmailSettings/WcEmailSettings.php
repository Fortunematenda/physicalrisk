<?php 

namespace EmailKit\Admin\EmailSettings;

use WP_Query;
use EmailKit\Admin\TemplateList;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Emails\Helpers\Utils;

defined('ABSPATH') || exit; 

class WcEmailSettings {

	public function __construct() {

		add_filter( 'woocommerce_email_setting_columns', [$this, 'emailkit_email_setting_columns' ] );
     	add_action( 'woocommerce_email_setting_column_template', array( $this, 'emailkit_column_template' ) );
		add_action( 'admin_enqueue_scripts',[$this, 'woocomerce_integration'] );
	}

	public function emailkit_email_setting_columns ($array) {

		if ( isset( $array['actions'] ) ) {
			unset( $array['actions'] );
			return array_merge(
				$array,
				array(
					'template' => 'EmailKit',
					'actions'  => '',
				)
			);
		}
		return $array;
	}

	public function emailkit_column_template($email) {
		
		$wc_template_type = $email->id;
		$builder_url= '';
		$demo_url = '';
		$emailkit_email_type = '';
		$emailkit_template_title = '';
		$template_type = '';
		// Get the post ID based on email type and template types
		$post_id = $this->get_emailkit_post_id($wc_template_type);
	

		$emailkit_template = $this->find_emailkit_template($wc_template_type);
         
		if (null === $post_id) {
			if (isset($emailkit_template)) {
				$demo_url = isset($emailkit_template['file']) ? $emailkit_template['file'] : '';
				$emailkit_email_type = isset($emailkit_template['mail_type']) ? $emailkit_template['mail_type'] : '';
				$emailkit_template_title = isset($emailkit_template['title']) ? $emailkit_template['title'] : '';
				$template_type = isset($emailkit_template['template_type']) ? $emailkit_template['template_type'] : '';
			}
		} else {

			$builder_url = admin_url("post.php?post={$post_id}&action=emailkit-builder");
		}


		echo wp_kses( '<td class="wc-email-settings-table-template emailkit-woocom-wrap">
         	<button id="" class="emailkit-woocom-btn emailkit-open-new-form-editor-modal emailkit-edit-button"
                 target="_blank"
                 href="' . esc_url($builder_url) . '" 
                 data-editor-template-url="' . esc_attr($demo_url) . '" 
                 data-emailkit-email-type="' . esc_attr($emailkit_email_type) . '"
                 data-emailkit-template-title="' . esc_attr($emailkit_template_title) . '"
                 data-emailkit-template-type="' . esc_attr($template_type) . '"
                 data-emailkit-template="' . esc_attr($emailkit_email_type) . '&emailkit_template_type=' . esc_attr($emailkit_template_title) . '">'
                 . esc_html(__('Edit With Emailkit', 'emailkit')) .
         	'</button>
      	</td>', Utils::get_kses_array() );
	}
	
	private function get_emailkit_post_id($wc_template_type) {
		
		$args = array(
			'post_type'      => 'emailkit',
			'posts_per_page' => -1,
			'meta_query'     => array(
				'relation' => 'AND', // Use AND relation for matching both conditions
				array(
					'key'   => 'emailkit_template_type',
					'value' => $wc_template_type,
				),
				/* array(
					'key'   => 'emailkit_template_status',
					'value' => 'inactive', // Modify this value based on your requirements
				), */
			),
		);
	
		$query = new WP_Query($args);
		$post_ids = array();
		
	
		if ($query->have_posts()) {
			while ($query->have_posts()) {
				$query->the_post();
				$post_ids[] = get_the_ID();
			}
			wp_reset_postdata();
		}
	
		// error_log(\print_r($post_ids,true));
		// Return the first matching post ID
		return $post_ids[0]?? null;
	}

	
	function woocomerce_integration() {
		
        wp_enqueue_script("emailkit-admin-wc-js" , EMAILKIT_ADMIN . 'EmailSettings/Wcintegration.js' , ['jquery'], EMAILKIT_VERSION, true);
		wp_localize_script( 'emailkit-admin-wc-js', 'woocommerce',
			array( 
				'ajaxurl' => admin_url( 'admin-ajax.php' ),
				'nonce' => wp_create_nonce('emailkit_nonce'),
				'rest_url' => esc_url(get_rest_url(null, 'emailkit/v1/')),
				'rest_nonce' => wp_create_nonce('wp_rest')
			)
		);

		
    }
	
	function find_emailkit_template($wc_template_type) {
        $templates = TemplateList::get_templates();
		$template_title = EmailLists::woocommerce_email($wc_template_type);
		
        foreach ($templates as $key => $value) {
            $email_type = $value['mail_type'];
            $template_email_type = $value['title'];
          

            if ($email_type == 'woocommerce' && $wc_template_type ==  $template_email_type) {

		
                return [
                    'file' => $value['file'],
                    'mail_type' => $email_type,
					'template_type' => $wc_template_type,
                    'title' => $template_title,
                ];
            }
        }

        return [];
    }

 
}