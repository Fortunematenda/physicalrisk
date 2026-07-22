<?php
namespace MetForm\Core\Forms;
defined( 'ABSPATH' ) || exit;
Class Hooks{

  use \MetForm\Traits\Singleton;

  public function Init(){
    add_filter( 'the_content', [ $this, 'get_form_content_on_preview' ] );
    add_action( 'admin_init', [ $this, 'add_author_support' ], 10 );
    add_filter( 'manage_metform-form_posts_columns', [ $this, 'set_columns' ] );
    add_action( 'manage_metform-form_posts_custom_column', [ $this, 'render_column' ], 10, 2 );
  }

  public function get_form_content_on_preview($content) {

    if (isset($GLOBALS['post']) && $GLOBALS['post']->post_type == 'metform-form') {
      return \MetForm\Utils\Util::render_form_content($content, get_the_ID());
    }
    return $content;
  }

  public function add_author_support(){
    add_post_type_support( 'metform-form', 'author' );
  }

  public function set_columns( $columns ) {

    $date_column = $columns['date'];

    unset( $columns['date'] );
    unset( $columns['author'] );

    $columns['shortcode'] = esc_html__( 'Shortcode', 'metform' );
    $columns['count'] = esc_html__( 'Entries', 'metform' );
    $columns['views_conversion'] = esc_html__( 'Views/ Conversion', 'metform' );
    $columns['mf_date']      = esc_html( $date_column );
    $columns['mf_actions']       = esc_html__( 'Actions', 'metform' );
    return $columns;
  }

  public function render_column( $column, $post_id ) {
    switch ( $column ) {
      case 'shortcode':
        echo '<div class="wp-ui-text-highlight code mf-shortcode-wrap">[metform form_id="' . esc_html( $post_id ) . '"]</div>';
        break;
      case 'count':
        $count = \MetForm\Core\Entries\Action::instance()->get_entry_count($post_id);

        global $wp;
        $current_url = admin_url();
        $current_url .="edit.php?post_type=metform-entry&mf_form_id=".esc_attr($post_id);

        $rest_url = get_rest_url();
        $mf_ex_nonce = wp_create_nonce('wp_rest');
        $url = $rest_url."metform/v1/entries/export/".$post_id;
        $export_url = \MetForm\Utils\Util::add_param_url($url, "_wpnonce", $mf_ex_nonce);

        ?>
        <a data-metform-form-id="<?php echo esc_attr($post_id); ?>" class='<?php echo class_exists('\MetForm_Pro\Plugin') || $this->is_old_user() ? esc_attr("") : esc_attr("mf-entry-count-btn"); ?>  attr-btn attr-btn-primary mf-entry-filter' href="<?php echo esc_url($current_url); ?>"><?php echo esc_html($count); ?></a>
        <?php if(class_exists('\MetForm_Pro\Plugin') || $this->is_old_user()) : ?>
          <a class='attr-btn attr-btn-primary mf-entry-export-csv' href="<?php echo esc_url($export_url); ?>"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.6665 8.66665V2.66811C2.6665 1.93115 3.26436 1.33396 4.00132 1.33478L8.6637 1.33997L13.3332 5.99998V8.66665M8.6665 1.66665V4.66665C8.6665 5.40303 9.26344 5.99998 9.99984 5.99998H12.9998" stroke="#585960" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.6665 10.6667H7.33317C6.96497 10.6667 6.6665 10.9652 6.6665 11.3334V12C6.6665 12.3682 6.96497 12.6667 7.33317 12.6667H7.99984C8.36804 12.6667 8.6665 12.9652 8.6665 13.3334V14C8.6665 14.3682 8.36804 14.6667 7.99984 14.6667H6.6665M10.3332 10.6667L11.8332 14.6667L13.3332 10.6667M4.99984 14C4.99984 14.3682 4.70136 14.6667 4.33317 14.6667H3.33317C2.96498 14.6667 2.6665 14.3682 2.6665 14V11.3334C2.6665 10.9652 2.96498 10.6667 3.33317 10.6667H4.33317C4.70136 10.6667 4.99984 10.9652 4.99984 11.3334" stroke="#585960" stroke-linecap="round" stroke-linejoin="round"/></svg><?php echo esc_html__('CSV', 'metform'); ?></a>
        <?php else : ?>
          <div class="mf-pro-badge-wrapper mf-entry-pro mf-svg-container">
              <div class="mf-svg-inner mf-export-pdf-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 13 14" fill="none"><path d="M10.225 6.025h-8.4a1.2 1.2 0 0 0-1.2 1.2v4.2a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2v-4.2a1.2 1.2 0 0 0-1.2-1.2m-7.2 0v-2.4a3 3 0 1 1 6 0v2.4" stroke="#2271B1" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <div class="mf-svg-text"><?php echo esc_html__('CSV', 'metform'); ?></div>
              </div>
          </div>
        <?php endif;
          $settings =  get_option('metform_option__settings', []);
          $mf_pro_active = class_exists('\MetForm_Pro\Plugin') && (\MetForm\Utils\Util::is_mid_tier() || \MetForm\Utils\Util::is_top_tier());
          // On mid/top tier Pro, hide the analytics action entirely when the Pro analytics implementation (MetForm_Pro\Core\Analytics\Base) is missing.
          $mf_hide_analytics = $mf_pro_active && ! class_exists('\MetForm_Pro\Core\Analytics\Base');
          if($mf_hide_analytics) :
            // Pro analytics implementation missing — render nothing.
          elseif($mf_pro_active && !empty($settings['mf_enable_form_analytics']) ) : ?>
            <a data-metform-form-id="<?php echo esc_attr($post_id); ?>" class='mf-individual-analytics mf-view-details-btn' href="#" data-mf-tooltip="<?php echo esc_attr__('View Details', 'metform'); ?>"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7.33333L5.33333 4L8.66667 7.33333L14 2" stroke="#049E61" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10V14M6 8.66667V14M10 10.6667V14M14 6V14" stroke="#049E61" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
          <?php elseif(!$mf_pro_active) : ?>
            <div class="mf-pro-badge-wrapper mf-entry-pro mf-svg-container mf-tooltip-wrapper" data-tooltip="<?php echo esc_attr__('Upgrade for premium access.', 'metform'); ?>">
                <div class="mf-svg-inner mf-export-pdf-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 13 14" fill="none"><path d="M10.225 6.025h-8.4a1.2 1.2 0 0 0-1.2 1.2v4.2a1.2 1.2 0 0 0 1.2 1.2h8.4a1.2 1.2 0 0 0 1.2-1.2v-4.2a1.2 1.2 0 0 0-1.2-1.2m-7.2 0v-2.4a3 3 0 1 1 6 0v2.4" stroke="#2271B1" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7.33333L5.33333 4L8.66667 7.33333L14 2" stroke="#2271B1" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10V14M6 8.66667V14M10 10.6667V14M14 6V14" stroke="#2271B1" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
            </div>
          <?php else : ?>
            <?php // Pro active + mid/top tier but analytics disabled in settings — render nothing. ?>
          <?php endif; ?>
        </div>
        <?php
        break;
      case 'views_conversion':
        $views = \MetForm\Core\Forms\Action::instance()->get_count_views($post_id);
        $views = (int)$views;

        $count = \MetForm\Core\Entries\Action::instance()->get_entry_count($post_id);
        $count = (int)$count;

        if($views != 0){
          $conversion = ($count*100)/$views;
          $conversion = round($conversion, 2);
        }else{
          $conversion = 0;
        }
        echo esc_html($views."/ ".$conversion."%");
      break;

      case 'mf_date':
        $post       = get_post( $post_id );
        $date       = get_the_date( 'Y/m/d \a\t g:i a', $post );
        echo esc_html( $date );
      break;

      case 'mf_actions':
        $edit_url  = admin_url( 'post.php?post=' . $post_id . '&action=elementor' );
        $view_url  = get_permalink( $post_id );
        $trash_url = get_delete_post_link( $post_id );

        $view_icon      = '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.3628 7.36325C14.5655 7.64745 14.6668 7.78959 14.6668 7.99992C14.6668 8.21025 14.5655 8.35239 14.3628 8.63659C13.4521 9.91365 11.1263 12.6666 8.00016 12.6666C4.87402 12.6666 2.54823 9.91365 1.63752 8.63659C1.43484 8.35239 1.3335 8.21025 1.3335 7.99992C1.3335 7.78959 1.43484 7.64745 1.63752 7.36325C2.54823 6.08621 4.87402 3.33325 8.00016 3.33325C11.1263 3.33325 13.4521 6.08621 14.3628 7.36325Z" stroke="#2D59F2" stroke-width="1.2"/><path d="M10 8C10 6.8954 9.1046 6 8 6C6.8954 6 6 6.8954 6 8C6 9.1046 6.8954 10 8 10C9.1046 10 10 9.1046 10 8Z" stroke="#2D59F2" stroke-width="1.2"/></svg>';
        $edit_icon      = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.75 13.4773C12.2562 13.4773 13.4773 12.2562 13.4773 10.75C13.4773 9.24375 12.2562 8.02271 10.75 8.02271C9.24375 8.02271 8.02271 9.24375 8.02271 10.75C8.02271 12.2562 9.24375 13.4773 10.75 13.4773Z" stroke="#3970FF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.4773 13.4773C17.3563 13.7515 17.3202 14.0556 17.3736 14.3505C17.4271 14.6454 17.5677 14.9176 17.7773 15.1318L17.8318 15.1864C18.0009 15.3552 18.135 15.5557 18.2265 15.7765C18.318 15.9972 18.3651 16.2338 18.3651 16.4727C18.3651 16.7117 18.318 16.9483 18.2265 17.169C18.135 17.3897 18.0009 17.5902 17.8318 17.7591C17.663 17.9281 17.4624 18.0622 17.2417 18.1537C17.021 18.2452 16.7844 18.2923 16.5455 18.2923C16.3065 18.2923 16.0699 18.2452 15.8492 18.1537C15.6285 18.0622 15.428 17.9281 15.2591 17.7591L15.2045 17.7045C14.9903 17.495 14.7182 17.3544 14.4233 17.3009C14.1284 17.2474 13.8242 17.2835 13.55 17.4045C13.2811 17.5198 13.0518 17.7111 12.8903 17.955C12.7288 18.1989 12.6421 18.4847 12.6409 18.7773V18.9318C12.6409 19.414 12.4494 19.8765 12.1084 20.2175C11.7674 20.5584 11.3049 20.75 10.8227 20.75C10.3405 20.75 9.87805 20.5584 9.53708 20.2175C9.1961 19.8765 9.00455 19.414 9.00455 18.9318V18.85C8.99751 18.5491 8.90011 18.2573 8.72501 18.0125C8.54991 17.7676 8.30521 17.5812 8.02273 17.4773C7.74853 17.3563 7.44437 17.3202 7.14947 17.3736C6.85456 17.4271 6.58244 17.5677 6.36818 17.7773L6.31364 17.8318C6.14478 18.0009 5.94425 18.135 5.72353 18.2265C5.5028 18.318 5.26621 18.3651 5.02727 18.3651C4.78834 18.3651 4.55174 18.318 4.33102 18.2265C4.11029 18.135 3.90977 18.0009 3.74091 17.8318C3.57186 17.663 3.43775 17.4624 3.34626 17.2417C3.25476 17.021 3.20766 16.7844 3.20766 16.5455C3.20766 16.3065 3.25476 16.0699 3.34626 15.8492C3.43775 15.6285 3.57186 15.428 3.74091 15.2591L3.79545 15.2045C4.00503 14.9903 4.14562 14.7182 4.1991 14.4233C4.25257 14.1284 4.21647 13.8242 4.09545 13.55C3.98022 13.2811 3.78887 13.0518 3.54497 12.8903C3.30107 12.7288 3.01526 12.6421 2.72273 12.6409H2.56818C2.08597 12.6409 1.62351 12.4494 1.28253 12.1084C0.941558 11.7674 0.75 11.3049 0.75 10.8227C0.75 10.3405 0.941558 9.87805 1.28253 9.53708C1.62351 9.1961 2.08597 9.00455 2.56818 9.00455H2.65C2.9509 8.99751 3.24273 8.90011 3.48754 8.72501C3.73236 8.54991 3.91883 8.30521 4.02273 8.02273C4.14374 7.74853 4.17984 7.44437 4.12637 7.14947C4.0729 6.85456 3.93231 6.58244 3.72273 6.36818L3.66818 6.31364C3.49913 6.14478 3.36503 5.94425 3.27353 5.72353C3.18203 5.5028 3.13493 5.26621 3.13493 5.02727C3.13493 4.78834 3.18203 4.55174 3.27353 4.33102C3.36503 4.11029 3.49913 3.90977 3.66818 3.74091C3.83704 3.57186 4.03757 3.43775 4.25829 3.34626C4.47901 3.25476 4.71561 3.20766 4.95455 3.20766C5.19348 3.20766 5.43008 3.25476 5.6508 3.34626C5.87152 3.43775 6.07205 3.57186 6.24091 3.74091L6.29545 3.79545C6.50971 4.00503 6.78183 4.14562 7.07674 4.1991C7.37164 4.25257 7.6758 4.21647 7.95 4.09545H8.02273C8.29161 3.98022 8.52092 3.78887 8.68245 3.54497C8.84397 3.30107 8.93065 3.01526 8.93182 2.72273V2.56818C8.93182 2.08597 9.12338 1.62351 9.46435 1.28253C9.80533 0.941558 10.2678 0.75 10.75 0.75C11.2322 0.75 11.6947 0.941558 12.0356 1.28253C12.3766 1.62351 12.5682 2.08597 12.5682 2.56818V2.65C12.5693 2.94253 12.656 3.22834 12.8176 3.47224C12.9791 3.71614 13.2084 3.90749 13.4773 4.02273C13.7515 4.14374 14.0556 4.17984 14.3505 4.12637C14.6454 4.0729 14.9176 3.93231 15.1318 3.72273L15.1864 3.66818C15.3552 3.49913 15.5557 3.36503 15.7765 3.27353C15.9972 3.18203 16.2338 3.13493 16.4727 3.13493C16.7117 3.13493 16.9483 3.18203 17.169 3.27353C17.3897 3.36503 17.5902 3.49913 17.7591 3.66818C17.9281 3.83704 18.0622 4.03757 18.1537 4.25829C18.2452 4.47901 18.2923 4.71561 18.2923 4.95455C18.2923 5.19348 18.2452 5.43008 18.1537 5.6508C18.0622 5.87152 17.9281 6.07205 17.7591 6.24091L17.7045 6.29545C17.495 6.50971 17.3544 6.78183 17.3009 7.07674C17.2474 7.37164 17.2835 7.6758 17.4045 7.95V8.02273C17.5198 8.29161 17.7111 8.52092 17.955 8.68245C18.1989 8.84397 18.4847 8.93065 18.7773 8.93182H18.9318C19.414 8.93182 19.8765 9.12338 20.2175 9.46435C20.5584 9.80533 20.75 10.2678 20.75 10.75C20.75 11.2322 20.5584 11.6947 20.2175 12.0356C19.8765 12.3766 19.414 12.5682 18.9318 12.5682H18.85C18.5575 12.5693 18.2717 12.656 18.0278 12.8176C17.7839 12.9791 17.5925 13.2084 17.4773 13.4773Z" stroke="#585960" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        $elementor_icon = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.40039C14.1974 2.40039 17.5996 5.80263 17.5996 10C17.5996 14.1974 14.1974 17.5996 10 17.5996C5.80263 17.5996 2.40039 14.1974 2.40039 10C2.40039 5.80263 5.80263 2.40039 10 2.40039ZM9.90039 12.9004H12.9004V12.7002H9.90039V12.9004ZM7.09961 12.9004H7.2998V7.09961H7.09961V12.9004ZM9.90039 10.0996H12.9004V9.89941H9.90039V10.0996ZM9.90039 7.2998H12.9004V7.09961H9.90039V7.2998Z" stroke="#585960" stroke-width="1.2"/></svg>';
        $trash_icon     = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 5.66675L14.4093 15.4141C14.3666 16.1178 13.7834 16.6667 13.0783 16.6667H6.92164C6.21659 16.6667 5.6334 16.1178 5.59075 15.4141L5 5.66675" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 5.66659H7.33333M7.33333 5.66659L8.16017 3.73731C8.26522 3.49219 8.50625 3.33325 8.77293 3.33325H11.2271C11.4937 3.33325 11.7348 3.49219 11.8398 3.73731L12.6667 5.66659M7.33333 5.66659H12.6667M16 5.66659H12.6667" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.3335 13V9" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.6665 13V9" stroke="#A32D2D" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        $output  = '<div class="mf-entry-actions">';
        $output .= '<a href="' . esc_url( $view_url ) . '" target="_blank" class="mf-entry-action-btn mf-entry-action-view" data-mf-tooltip="' . esc_attr__( 'View', 'metform' ) . '">' . $view_icon . '</a>';
        $output .= '<a href="#" class="mf-entry-action-btn metform-form-edit-btn" data-metform-form-id="' . esc_attr( $post_id ) . '" data-mf-tooltip="' . esc_attr__( 'Settings', 'metform' ) . '">' . $edit_icon . '</a>';
        $output .= '<a href="' . esc_url( $edit_url ) . '" class="mf-entry-action-btn mf-form-action-elementor" data-mf-tooltip="' . esc_attr__( 'Edit with Elementor', 'metform' ) . '">' . $elementor_icon . '</a>';
        if ( $trash_url ) {
          $output .= '<a href="' . esc_url( $trash_url ) . '" class="mf-entry-action-btn mf-entry-action-trash" data-mf-tooltip="' . esc_attr__( 'Move to Trash', 'metform' ) . '" onclick="return confirm(\'' . esc_js( __( 'Move this form to trash?', 'metform' ) ) . '\')">' . $trash_icon . '</a>';
        }
        $output .= '</div>';
        \MetForm\Utils\Util::metform_content_renderer( $output );
      break;
    }
  }
  
  /**
   * Check if the user is old user
   */
  public function is_old_user(){

    $install_date = get_option('metform_install_date', false);

    //if install date before 23 november 2025 then it is old user
    if($install_date && strtotime($install_date) < strtotime('2025-11-23')){
      return true;
    }

    return false;
  }
}
