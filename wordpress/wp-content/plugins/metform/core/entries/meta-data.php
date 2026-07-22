<?php

namespace MetForm\Core\Entries;

defined('ABSPATH') || exit;

#[\AllowDynamicProperties]
class Meta_Data
{

    private $browser_data = null;
    private $file_meta_data = null;

    private $form_id;
    private $form_data;
    private $form_settings;

    private $fields;

    public function __construct()
    {
        $this->cpt = new Cpt();
        add_action('save_post', [$this, 'store_form_data_cmb']);
        add_action('add_meta_boxes', [$this, 'add_form_id_cmb']);
        add_action('add_meta_boxes', [$this, 'add_form_data_cmb']);
        add_action('add_meta_boxes', [$this, 'add_publish_info_cmb']);

        add_action('add_meta_boxes', [$this, 'add_browser_data_cmb']);
        add_action('add_meta_boxes', [$this, 'add_file_upload_cmb']);
        add_action('admin_init', [$this, 'show_hide_payment_woo_meta_box']);
        
        // Register layout engine scripts & styles injection
        add_action('admin_enqueue_scripts', [$this, 'enqueue_entries_view_assets']);
        // Inside your class where you register hooks
        add_filter('admin_body_class', [$this, 'add_metform_admin_body_class']);
    }

    public function add_metform_admin_body_class($classes) {
        $screen = get_current_screen();
        
        // Replace 'your_cpt_name' with the actual value of $this->cpt->get_name()
        if ($screen && $screen->post_type === $this->cpt->get_name()) {
            $classes .= ' mf-admin-context';
        }
        
        return $classes;
    }
    public function enqueue_entries_view_assets($hook) {
        if (get_current_screen()->post_type === $this->cpt->get_name()) {            
            // Injects styling layouts and actions overrides
            wp_enqueue_style('metform-admin-entries-view-css', \MetForm\Plugin::instance()->plugin_url() . 'public/assets/css/admin-entries-view.css', array(), '1.2.0');
            wp_enqueue_script('metform-admin-entries-view-js', \MetForm\Plugin::instance()->plugin_url() . 'public/assets/js/admin-entries-view.js', array('jquery'), '1.2.0', true);
        }
    }

    function show_hide_payment_woo_meta_box() 
    {
        $post_id = isset($_GET['post']) ? sanitize_text_field(wp_unslash($_GET['post'])) : ''; 

        $getPaymentStatus = get_post_meta($post_id, 'metform_entries__payment_status', true);
        $getPaymentInvoiceStatus = get_post_meta($post_id, 'metform_entries__payment_invoice', true);
        
        if($getPaymentStatus || $getPaymentInvoiceStatus){
            add_action('add_meta_boxes', [$this, 'add_form_payment_status_cmb']);
        } 

        $getWooCheckoutStatus = get_post_meta($post_id, 'mf_woo_order_id', true);
        if($getWooCheckoutStatus){
            add_action('add_meta_boxes', [$this, 'add_woo_payment_status_cmb']);
        }
    }

    function add_form_id_cmb()
    {
        add_meta_box(
            'metform_entries__form_id',
            esc_html__('Entry Info', 'metform'),
            [$this, 'show_form_id_cmb'],
            $this->cpt->get_name(),
            'side',
            'high'
        );
    }

    function show_form_id_cmb($post)
    {
        wp_nonce_field('meta_nonce', 'meta_nonce');

        $this->form_id = get_post_meta($post->ID, 'metform_entries__form_id', true);
        $this->fields = Action::instance()->get_fields($this->form_id);
        $form_title = get_the_title((int)$this->form_id);
        ?>
        <div class="mf-entries-side-container">
            <div class="mf-entries-side-item">
                <label class="mf-entries-side-label"><?php esc_html_e('FORM NAME', 'metform'); ?></label>
                <div class="mf-entries-side-value"><?php echo esc_attr($form_title); ?></div>
            </div>
            <div class="mf-entries-side-item">
                <label class="mf-entries-side-label"><?php esc_html_e('ENTRY ID', 'metform'); ?></label>
                <div class="mf-entries-side-value">#<?php
                    $metform_entries_serial_no = get_post_meta($post->ID, 'metform_entries_serial_no', true);
                    echo esc_html(isset($metform_entries_serial_no) ? $metform_entries_serial_no : $post->ID);
                ?></div>
            </div>
            <div class="mf-entries-side-item">
                <label class="mf-entries-side-label"><?php esc_html_e('SUBMITTED BY', 'metform'); ?></label>
                <div class="mf-entries-side-value mf-user-link">
                    <?php
                       $logged_user_id = get_post_meta($post->ID, 'metform_entries__user_id', true);
                       if($logged_user_id){
                           $author_obj = get_user_by('id', $logged_user_id);
                           $profile_link = "<a href='". wp_nonce_url(admin_url()."/user-edit.php?user_id={$logged_user_id}")."'>{$author_obj->data->user_login}</a>"; 
                           echo wp_kses($profile_link, array('a' => ['href'=>[]]));
                       }else{
                           echo esc_html__("Visitor", "metform");
                       }
                    ?>
                </div>
            </div>
        </div>
        <?php
    }

    function add_form_data_cmb()
    {
        $post_id = isset($_GET['post']) ? sanitize_text_field(wp_unslash($_GET['post'])) : '';
        $form_id = get_post_meta($post_id, 'metform_entries__form_id', true);
        $form_settings = \MetForm\Core\Forms\Action::instance()->get_all_data($form_id);

        $data_title = esc_html__('Data', 'metform');
        if(isset($form_settings['form_type']) && $form_settings['form_type'] == 'quiz-form'){
            $data_title = esc_html__('Quiz Data', 'metform');
        }

        add_meta_box(
            'metform_entries__form_data',
            $data_title,
            [$this, 'show_form_data_cmb'],
            $this->cpt->get_name(),
            'normal',
            'high'
        );
    }

    function add_browser_data_cmb()
    {
        $post_id = (isset($_GET['post']) ? sanitize_text_field(wp_unslash($_GET['post'])) : '');
        $form_id = get_post_meta($post_id, 'metform_entries__form_id', true);
        $form_settings = \MetForm\Core\Forms\Action::instance()->get_all_data($form_id);

        $this->browser_data = get_post_meta($post_id, 'metform_form__entry_browser_data', true);
        if ($this->browser_data == '' && !isset($form_settings['capture_user_browser_data'])) {
            return;
        }

        add_meta_box(
            'metform_form__entry_browser_data',
            esc_html__('Browser Data', 'metform'),
            [$this, 'show_browser_data_cmb'],
            $this->cpt->get_name(),
            'side',
            'low'
        );
    }

    function show_browser_data_cmb($post)
    {
        ?>
        <div class="mf-entries-side-container">
            <?php if (!empty($this->browser_data) && is_array($this->browser_data)) : ?>
                <?php foreach ($this->browser_data as $key => $value) : ?>
                    <div class="mf-entries-side-item">
                        <label class="mf-entries-side-label"><?php echo esc_html(strtoupper(str_replace('_', ' ', $key))); ?></label>
                        <div class="mf-entries-side-value mf-mono-text"><?php echo esc_html($value); ?></div>
                    </div>
                <?php endforeach; ?>
            <?php else : ?>
                <div class="mf-fallback-text"><?php esc_html_e('Browser data not captured.', 'metform'); ?></div>
            <?php endif; ?>
        </div>
        <?php
    }

    function add_file_upload_cmb()
    {
        $post_id = (isset($_GET['post']) ? sanitize_text_field(wp_unslash($_GET['post'])) : '');
        $file_meta_data = get_post_meta($post_id, 'metform_entries__file_upload', true);
        $file_meta_data_new = get_post_meta($post_id, 'metform_entries__file_upload_new', true);
        if(is_array($file_meta_data) || is_array($file_meta_data_new)){
            add_meta_box(
                'metform_entries__file_upload',
                esc_html__('Files', 'metform'),
                [$this, 'show_file_upload_cmb'],
                $this->cpt->get_name(),
                'normal',
                'low'
            );
        }
    }

    function show_form_data_cmb($post)
    {
        wp_nonce_field('meta_nonce', 'meta_nonce');
        $this->form_data = get_post_meta($post->ID, 'metform_entries__form_data', true);
        $this->form_data = (isset($this->form_data)) ? $this->form_data : "";
        if ($this->form_data != '') {
            $form_html = \MetForm\Core\Entries\Form_Data::format_form_data($this->form_id, $this->form_data);
            \MetForm\Utils\Util::metform_content_renderer($form_html);
        }
    }

    function show_file_upload_cmb($post)
    {
        $post_id = (isset($_GET['post']) ? sanitize_text_field(wp_unslash($_GET['post'])) : '');
        $file_meta_data = get_post_meta($post_id, 'metform_entries__file_upload', true);

        if (!is_array($file_meta_data)) {
            $file_meta_data = get_post_meta($post_id, 'metform_entries__file_upload_new', true);
            if(!is_array($file_meta_data)) {
                return;
            } else {
                foreach($file_meta_data as $key => $value) {
                    if(!empty($value)) {
                        $this->show_file($value, $key);
                    }
                }
            }
        } else {
            $this->show_file($file_meta_data);
        }
    }

    public function show_file($files, $name = false)
    {
        echo '<div class="mf-entries-files-wrapper">';
        if($name) {
            echo '<div class="mf-entries-file-group-title">' . esc_html(((isset($this->fields[$name]->mf_input_label)) ? $this->fields[$name]->mf_input_label : $name)) . '</div>';
        }
        foreach($files as $key => $file) {
            if(is_null($name)) { $name = $key; }
            $file_url = isset($file['url']) ? $file['url'] : '';
            $file_type = isset($file['type']) ? $file['type'] : '';

            if ($file_url != '') {
                echo "<div class='mf-entries-file-row'>";
                if(!$name) {
                    echo "<span>" . esc_html(((isset($this->fields[$key]->mf_input_label)) ? $this->fields[$key]->mf_input_label : $key+1)) . ": </span>";
                }
                echo "<a target='_blank' class='button button-small' href=" . esc_url($file_url) . " download>" ."  <svg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'>
                    <rect x='0.5' y='0.5' width='13' height='13' rx='3.5' stroke='#7C99FF'/>
                    <path d='M7 4v4M7 8l-2-2M7 8l2-2' stroke='#2D59F2' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/>
                    <path d='M4.5 10h5' stroke='#2D59F2' stroke-width='1.2' stroke-linecap='round'/>
                </svg>
                " .  esc_html__('Download', 'metform') . "</a>";
                echo((in_array($file_type, ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/ico'])) ? ' <a href="#" class="button button-small" data-toggle="modal" data-target="#mfFileUploadModal' . esc_attr($name . $key) . '">' . "<svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path d='M10 8C10 6.8954 9.1046 6 8 6C6.8954 6 6 6.8954 6 8C6 9.1046 6.8954 10 8 10C9.1046 10 10 9.1046 10 8Z' stroke='#2D59F2' stroke-width='1.2'/>
                <path d='M7.99995 3.33337C10.7878 3.33337 13.1759 6.00885 14.1714 7.30817C14.4875 7.72091 14.4875 8.27917 14.1714 8.69191C13.1759 9.99124 10.7878 12.6667 7.99995 12.6667C5.2121 12.6667 2.82394 9.99124 1.8285 8.69191C1.51232 8.27917 1.51233 7.72091 1.8285 7.30817C2.82394 6.00885 5.2121 3.33337 7.99995 3.33337Z' stroke='#2D59F2' stroke-width='1.2' stroke-linejoin='round'/>
                </svg>" . esc_html__('View', 'metform') . '</a>' : '');
                echo "</div>";
            }
            $this->file_modal($name.$key, $file_url);
        }
        echo '</div>';
    }

    public function file_modal($key, $file_url) {
        ?>
        <div class="attr-modal attr-fade mf-modal-container" id="mfFileUploadModal<?php echo esc_attr($key) ?>" tabindex="-1" role="dialog" aria-hidden="true">
            <div class="attr-modal-dialog" role="document">
                <div class="attr-modal-content">
                    <div class="attr-modal-header">
                        <button type="button" class="attr-close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
                    </div>
                    <div class="attr-modal-body">
                        <img class="attr-img-responsive" src="<?php echo esc_url($file_url); ?>">
                    </div>
                </div>
            </div>
        </div>
        <?php
    }

    function store_form_data_cmb($post_id)
    {
        // add save code here
    }

    function add_woo_payment_status_cmb()
    {
        add_meta_box(
            'metform_entries__woo_checkout_status',
            esc_html__('Woocommerce Checkout', 'metform'),
            [$this, 'show_woo_checkout_status_cmb'],
            $this->cpt->get_name(),
            'side',
            'high'
        );
    }

    function show_woo_checkout_status_cmb($post)
    {
        $order_id = get_post_meta($post->ID, 'mf_woo_order_id', true);
        if($order_id == null) { return; }
        $order = wc_get_order($order_id);
        $order_url = get_admin_url() . 'post.php?post=' . $order_id . '&action=edit';
        ?>
        <div class="mf-entries-side-container">
            <div class="mf-entries-side-item">
                <label class="mf-entries-side-label">ORDER ID</label>
                <div class="mf-entries-side-value">#<?php echo esc_attr($order_id); ?></div>
            </div>
            <div class="mf-entries-side-item">
                <label class="mf-entries-side-label">ORDER STATUS</label>
                <div class="mf-entries-side-value"><?php echo esc_attr($order->get_status()); ?></div>
            </div>
            <div class="mf-entries-side-item">
                <label class="mf-entries-side-label">TOTAL</label>
                <div class="mf-entries-side-value"><?php echo esc_attr($order->get_total() . ' ' . $order->get_currency()); ?></div>
            </div>
            <div style="margin-top:8px;">
                <a class="button button-primary" href="<?php echo esc_url($order_url); ?>" target="__blank"><?php echo esc_html__('Order Details', 'metform'); ?></a>
            </div>
        </div>
        <?php
    }

    function add_form_payment_status_cmb()
    {
        add_meta_box(
            'metform_entries__payment_status',
            esc_html__('Payment', 'metform'),
            [$this, 'show_form_payment_status_cmb'],
            $this->cpt->get_name(),
            'side',
            'high'
        );
    }

    function show_form_payment_status_cmb($post)
    {
        ?>
        <div class="mf-entries-side-container">
            <div class="mf-entries-side-item">
                <label class="mf-entries-side-label">STATUS</label>
                <div class="mf-entries-side-value"><?php echo esc_html(get_post_meta($post->ID, 'metform_entries__payment_status', true)); ?></div>
            </div>
            <?php if (get_post_meta($post->ID, 'metform_entries__payment_invoice', true)) : ?>
                <div class="mf-entries-side-item">
                    <label class="mf-entries-side-label">INVOICE</label>
                    <div class="mf-entries-side-value"><?php echo esc_html(get_post_meta($post->ID, 'metform_entries__payment_invoice', true)); ?></div>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }

    function add_publish_info_cmb()
    {
        add_meta_box(
            'metform_entries__publish_info',
            esc_html__('Publish', 'metform'),
            [$this, 'show_publish_info_cmb'],
            $this->cpt->get_name(),
            'side',
            'low'
        );
    }

    function show_publish_info_cmb($post) {
        $status       = get_post_status($post);
        // Replace these two lines:
        $status_label = ($status === 'publish') ? esc_html__('Published', 'metform') : esc_html(ucfirst($status));
        $status_css   = ($status === 'publish') ? 'mf-status-published' : 'mf-status-other';

        // With this:
        $status_map = [
            'publish'  => esc_html__('Published', 'metform'),
            'pending'  => esc_html__('Pending Review', 'metform'),
            'draft'    => esc_html__('Draft', 'metform'),
            'private'  => esc_html__('Private', 'metform'),
            'trash'    => esc_html__('Trashed', 'metform'),
            'future'   => esc_html__('Scheduled', 'metform'),
        ];
        $status_label = $status_map[$status] ?? esc_html(ucfirst($status));
        $status_css   = 'mf-status-' . sanitize_html_class($status); // e.g. mf-status-publish, mf-status-draft

        // Visibility Logic
        if ($post->post_status === 'private') {
            $visibility = esc_html__('Private', 'metform');
        } elseif (!empty($post->post_password)) {
            $visibility = esc_html__('Password Protected', 'metform');
        } else {
            $visibility = esc_html__('Public', 'metform');
        }

        $published_date = get_the_date('M j, Y \a\t g:i a', $post);
        ?>
        <div class="mf-entries-side-container">
            <div class="mf-entries-side-item mf-entries-publish-item">
                <label class="mf-entries-side-label"><?php esc_html_e('STATUS', 'metform'); ?></label>
                <div class="mf-entries-side-value mf-entries-publish-row">
                    <span class="mf-entries-status-dot <?php echo esc_attr($status_css); ?>"></span>
                    <span class="mf-current-status-text <?php echo esc_attr($status_css); ?>"><?php echo esc_html($status_label); ?></span>
                    <a href="#" class="mf-entries-edit-link" data-mf-publish-toggle="post_status"><?php esc_html_e('Edit', 'metform'); ?></a>
                </div>
                <div class="mf-entries-publish-inline" id="mf-publish-status-edit" style="display:none; margin-top:8px;">
                    <select id="mf-post-status" class="mf-entries-publish-select">
                        <option value="publish" <?php selected($status, 'publish'); ?>><?php esc_html_e('Published', 'metform'); ?></option>
                        <option value="pending" <?php selected($status, 'pending'); ?>><?php esc_html_e('Pending Review', 'metform'); ?></option>
                        <option value="draft"   <?php selected($status, 'draft');   ?>><?php esc_html_e('Draft', 'metform'); ?></option>
                    </select>
                    <button type="button" class="button button-small mf-entries-publish-ok" data-mf-type="status" data-mf-target="mf-publish-status-edit"><?php esc_html_e('OK', 'metform'); ?></button>
                </div>
            </div>

            <div class="mf-entries-side-item mf-entries-publish-item">
                <label class="mf-entries-side-label"><?php esc_html_e('VISIBILITY', 'metform'); ?></label>
                <div class="mf-entries-side-value mf-entries-publish-row">
                    <span class="mf-current-visibility-text"><?php echo esc_html($visibility); ?></span>
                    <a href="#" class="mf-entries-edit-link" data-mf-publish-toggle="post_visibility"><?php esc_html_e('Edit', 'metform'); ?></a>
                </div>
                <div class="mf-entries-publish-inline" id="mf-publish-visibility-edit" style="display:none; margin-top:8px;">
                    <select id="mf-post-visibility" class="mf-entries-publish-select">
                        <option value="public" <?php echo (!$post->post_password && $post->post_status !== 'private') ? 'selected' : ''; ?>><?php esc_html_e('Public', 'metform'); ?></option>
                        <option value="private" <?php echo ($post->post_status === 'private') ? 'selected' : ''; ?>><?php esc_html_e('Private', 'metform'); ?></option>
                        <option value="password" <?php echo (!empty($post->post_password)) ? 'selected' : ''; ?>><?php esc_html_e('Password Protected', 'metform'); ?></option>
                    </select>
                    <div id="mf-password-input-wrap" style="display: <?php echo (!empty($post->post_password)) ? 'block' : 'none'; ?>; margin-top: 5px;">
                        <input type="text" id="mf-post-password" class="mf-entries-publish-select" value="<?php echo esc_attr($post->post_password); ?>" placeholder="Password" />
                    </div>
                    <button type="button" class="button button-small mf-entries-publish-ok" data-mf-type="visibility" data-mf-target="mf-publish-visibility-edit"><?php esc_html_e('OK', 'metform'); ?></button>
                </div>
            </div>

            <div class="mf-entries-side-item mf-entries-publish-item">
                <label class="mf-entries-side-label"><?php esc_html_e('PUBLISHED', 'metform'); ?></label>
                <div class="mf-entries-side-value mf-entries-publish-row">
                    <span><?php echo esc_html($published_date); ?></span>
                    <a href="#" class="mf-entries-edit-link" data-mf-publish-toggle="timestampdiv"><?php esc_html_e('Edit', 'metform'); ?></a>
                </div>
                <div class="mf-entries-publish-inline" id="mf-publish-date-edit" style="display:none; margin-top:8px;">
                    <input type="text" id="mf-aa" class="mf-entries-publish-select" value="<?php echo esc_attr(get_the_date('Y', $post)); ?>" maxlength="4" size="4" placeholder="YYYY">
                    -<input type="text" id="mf-mm" class="mf-entries-publish-select" value="<?php echo esc_attr(get_the_date('m', $post)); ?>" maxlength="2" size="2" placeholder="MM">
                    -<input type="text" id="mf-jj" class="mf-entries-publish-select" value="<?php echo esc_attr(get_the_date('d', $post)); ?>" maxlength="2" size="2" placeholder="DD">
                    <button type="button" class="button button-small mf-entries-publish-ok" data-mf-type="date" data-mf-target="mf-publish-date-edit"><?php esc_html_e('OK', 'metform'); ?></button>
                </div>
            </div>
        </div>
        <?php
    }
}