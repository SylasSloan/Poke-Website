// Small text-formatting helpers shared between index.html and pokemon-detail.html.

        // Helper: capitalize single word
        function cap(s){ return (s||'').toString().replace(/\b\w/g, c => c.toUpperCase()); }

        function titleCase(s) {
            return (s || '').toString().replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
