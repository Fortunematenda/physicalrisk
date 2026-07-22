const { registerCheckoutFilters } = wc.blocksCheckout;

/**
 * Swift Currency - WooCommerce Blocks Integration
 * 
 * This filter appends the approximate price in the alternate currency 
 * directly after the main total value in the Cart and Checkout blocks.
 */
registerCheckoutFilters('swiftcurrency', {
    totalValue: (defaultValue, extensions) => {
        const hint = extensions?.swiftcurrency?.hint;

        if (!hint) {
            return defaultValue;
        }

        /**
         * The totalValue filter must return a string.
         * Appending the hint as text to the existing price string.
         */
        return `${defaultValue} (${hint})`;
    },
});
