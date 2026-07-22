<?php

namespace MetForm\Core\Entries;

defined('ABSPATH') || exit;

class Form_Data
{
    private static $form_data = null;

    private static function get_form_data($form_id)
    {
        if (static::$form_data) {
            return static::$form_data;
        }

        $map_data = \MetForm\Core\Entries\Action::instance()->get_fields($form_id);

        return static::$form_data = json_decode(json_encode($map_data), true);
    }

    protected static function criteriaMet($conditional_value, $conditional_operator, $conditional_field_value)
    {
        switch ($conditional_operator) {
            case '<':
                return $conditional_value < $conditional_field_value;
            case '<=':
                return $conditional_value <= $conditional_field_value;
            case '>':
                return $conditional_value > $conditional_field_value;
            case '>=':
                return $conditional_value >= $conditional_field_value;
            case '==':
                return $conditional_value == $conditional_field_value;
            case '!=':
                return $conditional_value != $conditional_field_value;
            case 'empty':
                return empty($conditional_value);
            case 'not-empty':
                return !empty($conditional_value);
            default:
                return false;
        }
    }

    public static function format_form_data($form_id, $form_data)
    {
        $map_data = static::get_form_data($form_id);
        $form_settings = \MetForm\Core\Forms\Action::instance()->get_all_data($form_id);

        ob_start();
        ?>
        <div class="mf-entries-main-card-wrapper">
            <?php
            foreach ($map_data as $key => $value) {
                if (in_array($value['widgetType'], ['mf-simple-captcha', 'mf-recaptcha', 'mf-file-upload'])) {
                    continue;
                }

                $conditions = isset($map_data[$key]["mf_conditional_logic_form_list"]) ? $map_data[$key]["mf_conditional_logic_form_list"] : [];
                $no_of_condition = count($conditions);
                $checking_result = array();
                $condition_match_criteria = !empty($map_data[$key]["mf_conditional_logic_form_and_or_operators"]) ? $map_data[$key]["mf_conditional_logic_form_and_or_operators"] : '';

                list($map_data, $form_data, $checking_result) = self::condition_criteria_match($map_data, $key, $conditions, $form_data, $checking_result);

                 if ($no_of_condition > 1 && $condition_match_criteria == "or") {
                    if (!in_array(true, $checking_result)) {
                        continue;
                    }
                } else {
                    if (in_array(false, $checking_result)) {
                        continue;
                    }
                }

                $entry_row_correct_class = '';
                if(isset($form_settings['form_type']) && $form_settings['form_type'] === 'quiz-form' && isset($form_data['wrong-answer']) && isset($form_data['right-answer'])){
                    $wrong_answers = array_map('sanitize_text_field', explode(",", $form_data['wrong-answer']));
                    $right_answers = array_map('sanitize_text_field', explode(",", $form_data['right-answer']));

                    if(in_array($map_data[$key]['mf_input_name'], $right_answers)){
                        $entry_row_correct_class = 'mf-entries-correct-result';
                    } elseif( in_array($map_data[$key]['mf_input_name'], $wrong_answers) ){
                        $entry_row_correct_class = 'mf-entries-wrong-result';
                    }
                }

                // Row container
                echo sprintf("<div class='mf-entries-data-row %s'>", esc_attr($entry_row_correct_class));
                // Field label
                echo "<span class='mf-entries-field-label'>" . esc_html(($map_data[$key]['mf_input_label'] != '') ? $map_data[$key]['mf_input_label'] : $key) . "</span>";
                // Value container
                echo "<div class='mf-entries-value-pill-row'>";
                // Value box
                echo "<div class='mf-entries-field-value-box'>";

                // ── Standard text-like fields ──────────────────────────
                if (!in_array($value['widgetType'], ['mf-file-upload', 'mf-textarea', 'mf-simple-repeater', 'mf-signature', 'mf-like-dislike', 'mf-credit-card', 'mf-image-select', 'mf-checkbox', 'mf-mobile'])) {
                    $label = isset($map_data[$key]['mf_input_label']) ? $map_data[$key]['mf_input_label'] : '';

                    if ($label && isset($map_data[$key]['mf_input_list']) && is_array($map_data[$key]['mf_input_list']) && isset($form_settings['mf_field_name_show']) && $form_settings['mf_field_name_show'] == 1) {
                        $selected_values = isset($form_data[$key]) ? explode(',', $form_data[$key]) : array();
                        $values = array();
                        $option_text = '';

                        foreach ($map_data[$key]['mf_input_list'] as $item) {
                            if (isset($item['label']) && in_array($item['value'], $selected_values)) {
                                $values[$item['label']] = $item['label'];
                            }
                            if (isset($item['mf_input_option_text']) && isset($item['mf_input_option_value']) && $item['mf_input_option_value'] == $form_data[$key]) {
                                $option_text = $item['mf_input_option_text'];
                            }
                        }

                        if (!empty($values)) {
                            foreach ($values as $pill) {
                                echo "<span class='mf-entries-badge-pill'>" . esc_html($pill) . "</span>";
                            }
                        } else {
                            echo esc_html($option_text);
                        }
                    } else if (isset($value['widgetType']) && $value['widgetType'] == 'mf-text-editor') {
                        echo wp_kses_post($form_data[$key]);
                    } else {
                        $output = isset($form_data[$key]) ? (is_array($form_data[$key]) ? implode(', ', $form_data[$key]) : $form_data[$key]) : '';
                        echo esc_html($output);
                    }
                }

                // ── Mobile ────────────────────────────────────────────
                if (isset($value['widgetType']) && $value['widgetType'] == 'mf-mobile') {
                    echo esc_html(isset($form_data[$key]) ? $form_data[$key] : '');
                }

                // ── Checkbox ──────────────────────────────────────────
                if (isset($value['widgetType']) && $value['widgetType'] == 'mf-checkbox') {
                    $label = isset($map_data[$key]['mf_input_label']) ? $map_data[$key]['mf_input_label'] : '';
                    if ($label && isset($map_data[$key]['mf_input_list']) && is_array($map_data[$key]['mf_input_list']) && isset($form_settings['mf_field_name_show']) && $form_settings['mf_field_name_show'] == 1) {
                        $selected_values = isset($form_data[$key]) ? explode(',', $form_data[$key]) : array();
                        foreach ($map_data[$key]['mf_input_list'] as $item) {
                            if (isset($item['mf_input_option_text']) && in_array($item['mf_input_option_value'], $selected_values)) {
                                echo "<span class='mf-entries-badge-pill'>" . esc_html($item['mf_input_option_text']) . "</span>";
                            }
                        }
                    } else {
                        $output = isset($form_data[$key]) ? (is_array($form_data[$key]) ? implode(',', $form_data[$key]) : $form_data[$key]) : '';
                        if (!empty($output)) {
                            foreach (array_filter(array_map('trim', explode(',', $output))) as $pill) {
                                echo "<span class='mf-entries-badge-pill'>" . esc_html($pill) . "</span>";
                            }
                        }
                    }
                }

                // ── Image Select ──────────────────────────────────────
                if (isset($value['widgetType']) && $value['widgetType'] == 'mf-image-select') {
                    $selected_value = isset($form_data[$key]) ? $form_data[$key] : '';
                    $selected_values = is_array($selected_value) ? $selected_value : explode(',', $selected_value);

                    foreach ($map_data[$key]['mf_input_list'] as $item) {
                        if (isset($item['mf_input_option_value']) && in_array($item['mf_input_option_value'], $selected_values)) {
                            $pill_txt = (isset($item['mf_image_select_title']) && $item['mf_image_select_title'] !== '') ? $item['mf_image_select_title'] : $item['mf_input_option_value'];
                            echo "<span class='mf-entries-badge-pill'>" . esc_html($pill_txt) . "</span>";
                        }
                    }
                }

                // ── Signature ─────────────────────────────────────────
                if (isset($value['widgetType']) && $value['widgetType'] == 'mf-signature') {
                    echo "<img class='mf-entries-signature-img' src='" . esc_attr(isset($form_data[$key]) ? $form_data[$key] : '') . "'>";
                }

                // ── Textarea ──────────────────────────────────────────
                if (isset($value['widgetType']) && $value['widgetType'] == 'mf-textarea') {
                    echo wp_kses(isset($form_data[$key]) ? nl2br($form_data[$key]) : '', ['br' => []]);
                }

                // ── Simple Repeater ───────────────────────────────────
                if (isset($value['widgetType']) && $value['widgetType'] == 'mf-simple-repeater') {
                    $repeater_data = (array_key_exists($key, $form_data)) ? $form_data[$key] : [];
                    $count_index = 0; $previous_level = null;
                    foreach ($repeater_data as $k => $v) {
                        $repeater_level = null;
                        if (isset($map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_label"])) {
                            $repeater_level = $map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_label"];
                        }
                        if (isset($map_data[$key]["mf_input_repeater"][$count_index - 1]["mf_input_repeater_label"])) {
                            $previous_level = $map_data[$key]["mf_input_repeater"][$count_index - 1]["mf_input_repeater_label"];
                        }
                        if ($repeater_level == null && $previous_level != null) { $repeater_level = $previous_level; }

                        echo "<div class='mf-entries-repeater-row'><strong>" . esc_html(($repeater_level != null) ? $repeater_level : $k) . ": </strong>";
                        if ($repeater_level && isset($map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_option"]) && isset($form_settings['mf_field_name_show']) && $form_settings['mf_field_name_show'] == 1) {
                            $options = explode("\n", $map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_option"]);
                            $optionOutput = []; $selected_options = explode(',', $v);
                            foreach ($options as $option) {
                                list($optionName, $optionValue) = explode('|', $option);
                                if (in_array($optionValue, $selected_options)) { $optionOutput[] = $optionName; }
                            }
                            echo "<span>" . esc_html(implode(", ", $optionOutput)) . "</span>";
                        } else {
                            echo "<span>" . esc_html($v) . "</span>";
                        }
                        echo "</div>";
                        $count_index++;
                        if ($count_index == count($map_data[$key]["mf_input_repeater"])) {
                            $count_index = 0;
                            echo "<div class='mf-entries-repeater-divider'></div>";
                        }
                    }
                }

                // ── Credit Card ───────────────────────────────────────
                if (isset($value['widgetType']) && $value['widgetType'] == 'mf-credit-card') {
                    echo "<div><strong>" . esc_html__('Card Number:', 'metform') . "</strong> " . esc_html(isset($form_data[$key]) ? $form_data[$key] : '') . "</div>";
                    if (isset($form_data[$key . '--type'])) {
                        $type = $form_data[$key . '--type'];
                        $type = ($type === "amex") ? 'American Express' : $type;
                        echo "<div><strong>" . esc_html__('Card Type:', 'metform') . "</strong> " . esc_html(ucfirst($type)) . "</div>";
                    }
                }

                // ── Like / Dislike ────────────────────────────────────
                if (isset($value['widgetType']) && ($value['widgetType'] == 'mf-like-dislike')) {
                    $like_dislike = (isset($form_data[$key]) ? $form_data[$key] : '');
                    echo (($like_dislike == '1') ? "<span class='dashicons dashicons-thumbs-up' style='color:#2563eb;'></span>" : "");
                    echo (($like_dislike == '0') ? "<span class='dashicons dashicons-thumbs-down' style='color:#ef4444;'></span>" : "");
                }

                echo "</div>"; // close .mf-entries-field-value-box
                if ( isset( $form_settings['form_type'] ) && $form_settings['form_type'] === 'quiz-form'
                    && isset( $form_data['wrong-answer'] ) && isset( $form_data['right-answer'] ) ) {

                    if ( $entry_row_correct_class === 'mf-entries-correct-result' ) {
                        echo "<span class='mf-entries-result-pill mf-entries-result-pill--correct'>
                                <span class='dashicons dashicons-yes'></span>" . esc_html__('Correct', 'metform') . "
                            </span>";
                    } elseif ( $entry_row_correct_class === 'mf-entries-wrong-result' ) {
                        echo "<span class='mf-entries-result-pill mf-entries-result-pill--wrong'>
                                <span class='dashicons dashicons-no-alt'></span>" . esc_html__('Wrong', 'metform') . "
                            </span>";
                    }
                }
                echo "</div>"; // close .mf-entries-data-row
                echo "</div>"; // close .mf-entries-value-pill-row
            }
            ?>
            <?php do_action('metform_after_entries_table_data', $form_id, $form_data, $map_data); ?>
        </div>
        <?php
        $data_html = ob_get_contents();
        ob_end_clean();
        return $data_html;
    }

    public static function format_data_for_mail($form_id, $form_data, $file_info)
    {
        $map_data = static::get_form_data($form_id);
        $form_settings = \MetForm\Core\Forms\Action::instance()->get_all_data($form_id);

        //$file_meta_data = get_post_meta( $post_id, 'metform_entries__file_upload', true );

        ob_start();

    ?>
        <div style="border-left:5px solid #2EB5AB;padding-left:5px;">
            <table width="100%" cellpadding="5" cellspacing="0" bgcolor="#FFFFFF" style="border: 1px solid #EAF2FA; word-break: break-word;">
                <tbody>
                    <?php
                    foreach ($map_data as $key => $value) {

                        if (in_array($value['widgetType'], ['mf-simple-captcha', 'mf-recaptcha', 'mf-file-upload', 'mf-button'])) {
                            continue;
                        }

                 

                        $conditions = isset($map_data[$key]["mf_conditional_logic_form_list"]) ? $map_data[$key]["mf_conditional_logic_form_list"] : [];
                        $no_of_condition = count($conditions);
                        $checking_result = array();
                        $condition_match_criteria = !empty($map_data[$key]["mf_conditional_logic_form_and_or_operators"]) ? $map_data[$key]["mf_conditional_logic_form_and_or_operators"] : '';

                        list($map_data, $form_data, $checking_result) = self::condition_criteria_match($map_data, $key, $conditions, $form_data, $checking_result);

                        if ($no_of_condition > 1 && $condition_match_criteria == "or") {
                            if (!in_array(true, $checking_result)) {
                                continue;
                            }
                        } else {
                            if (in_array(false, $checking_result)) {
                                continue;
                            }
                        }

                        echo "<tr bgcolor='#EAF2FA'>";
                        echo "<td colspan='2'><strong>" . esc_html(($map_data[$key]['mf_input_label'] != '') ? $map_data[$key]['mf_input_label'] : $key) . "</strong></td>";
                        echo "</tr>";
                        echo "<tr bgcolor='#FFFFFF'>";
                        echo "<td width='20'>&nbsp;</td>";

                        if (!in_array($value['widgetType'], ['mf-file-upload', 'mf-textarea', 'mf-simple-repeater', 'mf-signature', 'mf-like-dislike', 'mf-credit-card','mf-image-select','mf-checkbox','mf-mobile'])) {                            
                          
                            $label = isset($map_data[$key]['mf_input_label']) ? $map_data[$key]['mf_input_label'] : '';                             
                            
                            if ($label && 
                                isset($map_data[$key]['mf_input_list']) 
                                && is_array($map_data[$key]['mf_input_list']) 
                                && isset($form_settings['mf_field_name_show'] ) 
                                &&  $form_settings['mf_field_name_show']  == 1) {
                                
                                $selected_values = isset($form_data[$key]) ? explode(',', $form_data[$key]) : array();                                
                                $values = array();     
                                $option_text = '';                           
                               
                                foreach ($map_data[$key]['mf_input_list'] as $item) {
                                    
                                    
                                    // Check if 'label' key exists in the item
                                    if ( isset($item['label']) && in_array($item['value'], $selected_values) ) { 
                                        $values[$item['label']] = $item['label'] . ' - ' . $item['value'];
                                    }

                                    if ( isset($item['mf_input_option_text']) 
                                        &&  isset($item['mf_input_option_value']) 
                                        && $item['mf_input_option_value'] == $form_data[$key]  ) {

                                        $option_text = $item['mf_input_option_text'] .' - '. $item['mf_input_option_value'] ;   
                                    }
                                    
                                } 
                                $result =  implode(', ', $values);

                                if(!empty($result)){
                                    echo "<td>" . esc_html($result) . "</td>";
                                }else{
                                    echo "<td>" . esc_html( $option_text ) . "</td>";
                                }
                            } else if(isset($value['widgetType']) && $value['widgetType'] == 'mf-text-editor') {
                                echo "<td>" . wp_kses_post($form_data[$key]) . "</td>";
                            }else{
                                $output = isset($form_data[$key]) ? (is_array($form_data[$key]) ? implode(', ', $form_data[$key]) : $form_data[$key]) : '';
                                echo "<td>" . esc_html($output) . "</td>";
                            }
                        }

                        if (isset($value['widgetType']) && $value['widgetType'] == 'mf-mobile') {
                            $output = isset($form_data[$key]) && !empty($form_data[$key]) ? esc_html($form_data[$key]) : '';
                            echo "<td>" . $output . "</td>";
                        }
                        
                        if (isset($value['widgetType']) && $value['widgetType'] == 'mf-checkbox') {
                            $label = isset($map_data[$key]['mf_input_label']) ? $map_data[$key]['mf_input_label'] : '';
                        
                            if ($label && isset($map_data[$key]['mf_input_list']) && is_array($map_data[$key]['mf_input_list']) && isset($form_settings['mf_field_name_show']) && $form_settings['mf_field_name_show'] == 1) {
                                $selected_values = isset($form_data[$key]) ? explode(',', $form_data[$key]) : array();                                
                                $values = array();
                        
                                foreach ($map_data[$key]['mf_input_list'] as $item) {
                                    if (isset($item['mf_input_option_text']) && in_array($item['mf_input_option_value'], $selected_values)) {
                                        $values[$item['mf_input_option_text']] = $item['mf_input_option_text'] . ' - ' . $item['mf_input_option_value'];
                                    }
                                }
                        
                                $result = implode(', ', $values);
                        
                                if (!empty($result)) {
                                    echo "<td>" . esc_html($result) . "</td>";
                                }
                            } else {
                                $output = isset($form_data[$key]) ? (is_array($form_data[$key]) ? implode(', ', $form_data[$key]) : $form_data[$key]) : '';
                                echo "<td>" . esc_html($output) . "</td>";
                            }
                        }

                        if (isset($value['widgetType']) && $value['widgetType'] == 'mf-image-select') {
                            $selected_value = isset($form_data[$key]) ? $form_data[$key] : '';
                            $option_text = '';
                            $option_value = '';
                        
                            foreach ($map_data[$key]['mf_input_list'] as $item) {
                                if (isset($item['mf_input_option_value']) && $item['mf_input_option_value'] == $selected_value ) {
                                    if (isset($item['mf_image_select_title']) && $item['mf_image_select_title'] !== '') {
                                        // If mf_image_select_title is not empty, use it in the option text.
                                        $option_text = $item['mf_image_select_title'] . ' - ' . $item['mf_input_option_value'];
                                    } else {
                                        // If mf_image_select_title is empty, use mf_input_option_value.
                                        $option_text = $item['mf_input_option_value'];
                                    }
                                    
                                    $option_value = $item['mf_input_option_value'];
                        
                                }
                            }
                        
                            if (isset($form_settings['mf_field_name_show']) && $form_settings['mf_field_name_show'] == 1) {
                                echo "<td>" . esc_html($option_text) . "</td>";
                            } else {
                                echo "<td>" . esc_html($option_value) . "</td>";
                            }
                        }                      
                        
                        if (isset($value['widgetType']) && $value['widgetType'] == 'mf-signature') {
                            echo "<td><img class='signature-img' src='" . esc_attr(isset($form_data[$key]) ? $form_data[$key] : '') . "'></td>";
                        }

                        if (isset($value['widgetType']) && $value['widgetType'] == 'mf-textarea') {
                            echo "<td>" . wp_kses( isset($form_data[$key]) ? nl2br( $form_data[$key] ) : '', [ 'br' => [] ]) . "</td>";
                        }

                        if (isset($value['widgetType']) && $value['widgetType'] == 'mf-simple-repeater') {
                            echo "<td>";
                            $repeater_data = ((array_key_exists($key, $form_data)) ? $form_data[$key] : []);                            
                            $count_index = 0; // number of repeater input field counter
                            $previous_level = null;
                        
                            foreach ($repeater_data as $k => $v) {
                                $repeater_level = null;
                        
                                if ((isset($map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_label"]))) {
                                    $repeater_level = $map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_label"];
                                }
                                if ((isset($map_data[$key]["mf_input_repeater"][$count_index - 1]["mf_input_repeater_label"]))) {
                                    $previous_level = $map_data[$key]["mf_input_repeater"][$count_index - 1]["mf_input_repeater_label"];
                                }
                        
                                if ($repeater_level == null && $previous_level != null) {
                                    $repeater_level = $previous_level;
                                }
                        
                                echo "<strong>" . esc_html(($repeater_level != null) ? $repeater_level : $k) . ": </strong>";
                                
                                if ($repeater_level  && isset($map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_option"]) && isset($form_settings['mf_field_name_show']) && $form_settings['mf_field_name_show'] == 1) {
                                    $options = explode("\n", $map_data[$key]["mf_input_repeater"][$count_index]["mf_input_repeater_option"]);
                                    $optionOutput = [];
                                    $selected_options = explode(',', $v);
                                    foreach ($options as $option) {
                                        list($optionName, $optionValue) = explode('|', $option);
                                        if (in_array($optionValue, $selected_options)) {
                                            $optionOutput[] = "$optionName - $optionValue";
                                        }
                                    }
                                    echo wp_kses_post("<span>" . implode(", ", $optionOutput) . "</span>");
                                } else {
                                    echo wp_kses_post("<span>" . esc_html($v) . "</span>");
                                }
                        
                                echo "<br>";
                                $count_index++;
                        
                                if ($count_index == count($map_data[$key]["mf_input_repeater"])) {
                                    $count_index = 0;
                                    echo "<div class='simple-repeater-entry-data-divider'></div>";
                                }
                            }
                            echo "</td>";
                        }

                        /**
                         * Credit Card form data entries
                         */
                        if (isset($value['widgetType']) && $value['widgetType'] == 'mf-credit-card') {
                            echo "<td><strong>". esc_html__('Number:', 'metform') ."</strong> " . esc_html(isset($form_data[$key]) ? $form_data[$key] : '') . "</br>";
                            if (isset($form_data[$key . '--type'])) {
                                $type = $form_data[$key . '--type'];
                                $type = ($type === "amex") ? 'Amerian Express' : $type;
                                echo "<strong>".esc_html__('Type:', 'metform')."</strong> " . esc_html(ucfirst($type)) . " Card</td>";
                            }
                        }

                        echo "</tr>";
                    }

                    if (!empty($file_info)) {
                        foreach ($file_info as $key => $file) {
                            echo "<tr bgcolor='#EAF2FA'>";
                            echo "<td colspan='2'><strong>" . esc_html(($map_data[$key]['mf_input_label'] != '') ? $map_data[$key]['mf_input_label'] : $key) . "</strong></td>";
                            echo "</tr>";
                            echo "<tr bgcolor='#FFFFFF'>";
                            echo "<td width='20'>&nbsp;</td>";
                                echo "<td>";
                                    foreach($file as $value) {
                                        echo "<a href='" . esc_url(isset($value['url']) ? $value['url'] : '') . "'>".esc_html__('Download', 'metform')."</a> ";
                                    }
                                echo "</td>";
                            echo "</tr>";
                        }
                    }

                    ?>
                </tbody>
            </table>
        </div>
    <?php
        $data_html = ob_get_contents();
        ob_end_clean();
        return $data_html;
    }

    /**
     * @param mixed $map_data
     * @param int|string $key
     * @param mixed $conditions
     * @param $form_data
     * @param array $checking_result
     * @return array
     */
    public static function condition_criteria_match($map_data, $key, $conditions, $form_data, $checking_result)
    {
        if (!empty($map_data[$key]["mf_conditional_logic_form_enable"]) && $map_data[$key]["mf_conditional_logic_form_enable"] == "yes") {

            foreach ($conditions as $key=> $condition) {

                $conditional_field_name = !empty($condition["mf_conditional_logic_form_if"]) ? $condition["mf_conditional_logic_form_if"] : '';

                $conditional_operator = !empty($condition["mf_conditional_logic_form_comparison_operators"]) ? $condition["mf_conditional_logic_form_comparison_operators"] : 'not-empty';

                // operator value not-empty hole backend theke data ase na tai not-empty default vabe dewa hoise..
                // if condition logic change after submission previous entries condition also change.

                $conditional_field_value = !empty($condition["mf_conditional_logic_form_value"]) ? $condition["mf_conditional_logic_form_value"] : '';

                // Resolve dynamic reference in conditional field value if it matches [field-name] pattern
                if (is_string($conditional_field_value) && preg_match('/^\[([^\]]+)\]$/', $conditional_field_value, $matches)) {
                    $ref_key = $matches[1];
                    if (array_key_exists($ref_key, $form_data)) {
                        $ref_val = $form_data[$ref_key];
                        if (is_array($ref_val)) {
                            $conditional_field_value = implode(',', array_map('strval', $ref_val));
                        } elseif (is_scalar($ref_val) || is_null($ref_val)) {
                            $conditional_field_value = (string) $ref_val;
                        } else {
                            $conditional_field_value = '';
                        }
                    } else {
                        $conditional_field_value = '';
                    }
                }

                $conditional_value_data = !empty($form_data[$conditional_field_name]) ? $form_data[$conditional_field_name] : '';
                $condition_value_array = explode(",",$conditional_value_data);

                $condition_value_index = array_search($conditional_field_value, $condition_value_array);

                $conditional_value = isset($condition_value_array[$condition_value_index])? $condition_value_array[$condition_value_index] : "";

                $criteria_match = static::criteriaMet($conditional_value, $conditional_operator, $conditional_field_value);
                array_push($checking_result, $criteria_match);
            }
        }
        return array($map_data, $form_data, $checking_result);
    }
}
