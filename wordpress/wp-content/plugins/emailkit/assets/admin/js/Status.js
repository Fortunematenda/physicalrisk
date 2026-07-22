jQuery(document).ready(function($) {
    // Add a click event for the "Change Status" link
    $('.emailkit-admin-template-switch-main').each(function(index, item) {
        $(item).on('click', function(e) {
            e.preventDefault();
            let self = this;
            var templateId = $(this).find('.change-status-btn').attr('data-template-id');
            let switchLoader = $(this).find('.slider');
            switchLoader.addClass('emailkit-slider-loader');



            // Call the API to change the status
            $.ajax({
                url: emailkit.rest_url + 'template-status',
                method: 'POST',
                headers: {
                    'X-WP-Nonce': emailkit.rest_nonce,
                },
                data: {
                    templateId: templateId,

                },

                success: function(response) {
                    // Handle the API response accordingly
                    const { template_type } = response;

                    if (response?.status_text == 'Active') {
                        $(document).ready(function() {
                            let inputField = $(self).find('.change-status-btn');
                            inputField.prop('checked', true);
                            let activeText = $(self).next('.emailkit-admin-template-switch-active');
                            let inActiveText = $(self).prev('.emailkit-admin-template-switch-inactive');
                            
                            if(inActiveText.hasClass('emailkit-slider-active')){
                                inActiveText.removeClass('emailkit-slider-active')
                                activeText.addClass('emailkit-slider-active')
                            }
                            switchLoader.removeClass('emailkit-slider-loader');
                        });


                        if (template_type !== 'metform') {
                            let currInput = $(self).find('.change-status-btn');
                            let isTemplateActive = $(`.${template_type}`).not(currInput);
                            isTemplateActive.each(function(index, item) {
                                if ($(item).is(":checked")) {
                                    $(item).prop("checked", false);
                                }
                                let enableStatus = $(item).closest('.column-content-container').find('.emailkit-admin-template-switch-active');
                                let disableStatus = $(item).closest('.column-content-container').find('.emailkit-admin-template-switch-inactive');
                                if (enableStatus) {
                                    enableStatus.removeClass('emailkit-slider-active');
                                    disableStatus.addClass('emailkit-slider-active');
                                }
                            });
                        }

                    } else if (response?.status_text == 'Inactive') {

                        $(document).ready(function() {
                            let inputField = $(self).find('.change-status-btn');
                            inputField.prop('checked', false);
                            let activeText = $(self).next('.emailkit-admin-template-switch-active');
                            let inActiveText = $(self).prev('.emailkit-admin-template-switch-inactive');
                            
                            if(activeText.hasClass('emailkit-slider-active')){
                                activeText.removeClass('emailkit-slider-active')
                                inActiveText.addClass('emailkit-slider-active')
                            }
                            switchLoader.removeClass('emailkit-slider-loader');
                        });

                    }



                },
                error: function(error) {
                    console.error(error);
                },
            });

        })

    });

});