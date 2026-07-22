<div class="form-group emailkit-admin-input-text emailkit-admin-input-text-<?php echo esc_attr(self::strify($name)); ?>">
    <label for="emailkit-admin-option-text<?php echo esc_attr(self::strify($name)); ?>"><?php echo esc_html($label); ?></label>
    <input
        type="text"
        class="attr-form-control"
        id="emailkit-admin-option-text<?php echo esc_attr(self::strify($name)); ?>"
        aria-describedby="emailkit-admin-option-text-help<?php echo esc_attr(self::strify($name)); ?>"
        placeholder="<?php echo esc_attr($placeholder); ?>"
        name="<?php echo esc_attr($name); ?>"
        value="<?php echo esc_attr($value); ?>"
        <?php echo esc_attr($disabled) ?>
    >
    <small id="emailkit-admin-option-text-help<?php echo esc_attr(self::strify($name)); ?>" class="form-text text-muted"><?php echo esc_html($info); ?></small>
</div>