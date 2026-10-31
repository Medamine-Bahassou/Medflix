package com.medanime.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class CreditsTest {
    @Test fun catalogBoilerplateAndSeasonsDoNotAffectMatching() {
        assertEquals("breaking bad", Credits.norm("مشاهدة مسلسل Breaking Bad الموسم الثاني مترجم"))
        assertEquals("breaking bad", Credits.norm("Breaking Bad Season 2"))
        assertEquals("iron man 2", Credits.norm("فيلم Iron Man 2 2010 مترجم"))
    }
}
