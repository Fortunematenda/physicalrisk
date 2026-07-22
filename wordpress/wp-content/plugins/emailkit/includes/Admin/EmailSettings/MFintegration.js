jQuery(document).ready(function($) {
    function disableBtn(el, exceptEl = '', isTrue = false) {
        if (exceptEl !== "") {
            $(el).not(exceptEl).each((index, item) => {
                $(item).prop('disabled', isTrue);
            });
        } else {
            $(el).each((index, item) => {
                $(item).prop('disabled', isTrue);
            });
        }
    }

    $('.emailkit-metform-edit-button').on('click', function(e) {
        e.preventDefault();
        let _self = this;

        disableBtn('.emailkit-metform-btn', _self, true);

        var builderUrl = $(_self).attr('href');
        var editorTemplateUrl = $(this).data('editor-template-url');
        var emailType = $(this).data('emailkit-email-type');
        var templateType = $(this).data('emailkit-template-type');
        var templateTitle = $(this).data('emailkit-template-title'); 
        var templateStatus = 'active'; 
        let formId = $(this).attr('data-emailkit-form');
	    let formTitle = $(this).attr('data-emailkit-form-title');
    
    

        // If builder URL exists, open it directly
        if (builderUrl && builderUrl.trim() !== '') {
            window.open(builderUrl, '_blank');
            disableBtn('.emailkit-metform-btn', "", false);
            return false;
        }

       // $(_self).addClass('emailkit-slider-loader');

        // Check if template exists for this form
        $.ajax({
            url: metform.rest_url + 'check-template',
            method: 'GET',
            headers: {
                'X-WP-Nonce': metform.rest_nonce,
            },
            data: {
                'form_id': formId
            },
            success: function(response) {
                if (response.success && response.data.exists) {
                    // Open existing template
                    window.open(response.data.builder_url, '_blank');
                } else {
                    // Create new template
                    createNewTemplate();
                }
            },
            error: function(error) {
                console.error('Template check error:', error);
                createNewTemplate(); // Fallback to create new template
            }
        });

        function createNewTemplate() {
            $.ajax({
                url: metform.rest_url + 'create-template',
                method: 'POST',
                headers: {
                    'X-WP-Nonce': metform.rest_nonce,
                },
                data: {
                    'template_title': 'MetForm - ' + formTitle,
                    'form_id': formId,
                    'emailkit-editor-template': editorTemplateUrl,
                    'emailkit_email_type': emailType,
                    'emailkit_template_type': templateType,
                    'emailkit_template_title': templateTitle,
                    'emailkit_template_status': templateStatus
                },
                success: function(response) {
                    if (response.success && response.data.builder_url) {
                        window.open(response.data.builder_url, '_blank');
                        disableBtn('.emailkit-woocom-btn', "", false);
                       // jQuery(_self).removeClass('emailkit-slider-loader');;
                    }
                },
                error: function(error) {
                    console.error('Template creation error:', error);
                },
            });
        }
    });
});