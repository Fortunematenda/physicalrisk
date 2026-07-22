<?php
namespace EmailKit\Admin;

defined("ABSPATH" ) || exit;
use EmailKit\Admin\Emails\EmailLists;
use EmailKit\Admin\Dependency;

/**
 * EmailKitAjax is responsinle for all ajax request and responses
 */
class EmailKitAjax {

    public function __construct() {
        add_action( 'wp_ajax_emailkit_get_email_template_type', [ $this, 'get_email_template_type' ] );
        add_action( 'wp_ajax_emailkit_template_data', [ $this, 'get_template_data' ] );
        add_action( 'wp_ajax_emailkit_update_template_data', [ $this, 'update_template_data' ] );
        add_action( 'wp_ajax_emailkit_filter_save_as_template', [ $this, 'emailkit_filter_save_as_template' ] );
    }

    /**
     * get email type & send email template json response
     */
    function get_email_template_type() {

        // verify request
        if( empty( $_POST[ 'nonce' ] ) || !wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST[ 'nonce' ] ) ), 'emailkit_nonce' ) ) {
            return false;
        }

        $template_types = [];
        $email_type = '';
        if( isset( $_POST[ 'data' ] ) ) {
            $email_type = sanitize_text_field( wp_unslash( $_POST[ 'data' ] ) );
        }

        $dependency = Dependency::check( $email_type );

        
        if( true !== $dependency ){
            $need_plugin = [ 'dependency_status' => false, 'need_plugin' => $dependency ];
            wp_send_json_success( $need_plugin );
            exit;
        }

        $template_name = []; // Set data for dropdown
        foreach( self::get_type_wise_mails( $email_type ) as $key => $value ) {
            if( $email_type == 'saved-templates' ){
                $type_label = isset( $value['template_type'] ) ? ucwords(str_replace('_', ' ', $value['template_type'])) : '';
                $template_name[] = [ "id" => $value[ 'id'], "text" => $value[ 'title' ] .' - ' . $type_label ];
            }else{
                $template_name[] = [ "id" => $key, "text" => $value ];
            }
        }


        $templates = [ ];
        foreach( TemplateList::get_templates(  ) as $template ):

            if( isset( $template[ 'mail_type' ] ) && $email_type == $template[ 'mail_type' ] ) {
                ob_start();

                include EMAILKIT_DIR.'includes/views/modal-form-template-item.php';
                
                $templates[ ] = ob_get_clean();
            }

        endforeach;

        $data = [ 'templates' => $templates, 'template_name' => $template_name];


        wp_send_json_success( $data );

        exit;
    }

    /**
     * It fetch exact mail lists from all mail template 
     * @return array
     */
    static function get_type_wise_mails( $type ) : array {

        $type_list = [ 
            'woocommerce' => EmailLists::woocommerce_email(),
            'wordpress' => EmailLists::wordpress_email(),
            'saved-templates' => EmailLists::saved_templates(),
            'metform' => EmailLists::metform_email(),
        ];

        return $type_list[ $type ] ?? [];
    }

    /**
     * Get single template title and send json response
     */
    function get_template_data() {

        // verify request
        if( empty( $_POST[ 'nonce' ] ) || !wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST[ 'nonce' ] ) ), 'emailkit_nonce' ) ) {
            return false;
        }

        $ID = isset( $_POST[ 'ID' ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'ID' ] ) ) : null;

        if( $ID ) {
            wp_send_json_success( get_the_title( $ID ), 200 );
        }
        
        wp_send_json_error( esc_html__( 'Failed to get template', 'emailkit' ), 400 );

        exit;
    }

    /**
     * Filter saved templates and send json response
     */
    function emailkit_filter_save_as_template(  ) {
        
        // verify request
        if( empty( $_POST['nonce' ] ) || !wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['nonce' ] ) ), 'emailkit_nonce' ) ) {
            return false;
        }

        $template_id = isset( $_POST[ 'template_id' ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'template_id' ] ) ) : null;
        $saved_template_type = isset( $_POST[ 'email_type' ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'email_type' ] ) ) : null;


        $email_template_id  = get_post_meta( $template_id, 'emailkit_template_id', true );
        $email_type         = get_post_meta( $email_template_id, 'emailkit_email_type', true );
        $template_type      = get_post_meta( $email_template_id, 'emailkit_template_type', true );
        
        

        $dependency = Dependency::check( $email_type );
        
        if( true !== $dependency ){
            $need_plugin = [ 'dependency_status' => false, 'need_plugin' => $dependency ];
            wp_send_json_success( $need_plugin );
            exit;
        }
        if( true == $dependency ){
            $need_plugin = [ 'dependency_status' => true, 'need_plugin' => $dependency ];
            wp_send_json_success( $need_plugin );
            exit;
        }
    }

    /**
     * Update individual template title and return json response
     */
    function update_template_data(  ) {
        // verify request
        if( empty( $_POST[ 'nonce' ] ) || !wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST[ 'nonce' ] ) ), 'emailkit_nonce' ) ) {
            return false;
        }

        // check user capability
        if( ! current_user_can('manage_options') ) {

            wp_send_json_error( esc_html__( 'Insufficient permissions', 'emailkit' ), 403 );
            exit;
        }

        $ID = isset( $_POST[ 'id' ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'id' ] ) ) : null;
        $new_title = isset( $_POST[ 'title' ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'title' ] ) ) : '';
        $data = [];

        $post_update = array( 
            'ID'         => $ID,
            'post_title' => $new_title
         );

        $ID                   =   wp_update_post( $post_update );
        $data[ 'templateId' ] =   $ID;
        $data[ 'title' ]      =   get_the_title( $ID );

        if( isset( $_POST[ 'action_type' ] ) && sanitize_text_field( wp_unslash( $_POST[ 'action_type' ] ) ) == 'loadbuilder' ) {
            $data[ 'builder_url' ] = admin_url( "post.php?post={$ID}&action=emailkit-builder" ); // building the editor loading url if user submitted for 'update and edit'
        }

        if( $ID ) {
            wp_send_json_success( $data, 200 );
        }
        wp_send_json_error( esc_html__( 'Failed to get template', 'emailkit' ), 400 );

        exit;
    }

}