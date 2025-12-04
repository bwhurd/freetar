module.exports = {
    plugins: [
        require("cssnano")({
            preset: [
                "default",
                {
                    discardComments: { removeAll: true },
                    mergeLonghand: true,
                    mergeRules: true,
                    discardDuplicates: true
                }
            ]
        })
    ]
};
