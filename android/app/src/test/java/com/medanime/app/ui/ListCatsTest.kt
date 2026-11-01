package com.medanime.app.ui

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ListCatsTest {
    @Test fun namesAreUniqueAndOrderIsCreation() {
        val c = ListCats(JSONObject())
        val b = c.add("  Watching ", 2)!!
        val a = c.add("Favorites", 1)!!
        assertEquals(listOf(a, b), c.all().map { it.id })
        assertEquals("Watching", c.all()[1].name)
        assertNull(c.add("watching", 3)) // the same, whatever its case
        assertNull(c.add("   ", 4))
        assertFalse(c.rename(a, "WATCHING"))
        assertTrue(c.rename(a, "favorites")) // its own name, in another case
    }

    @Test fun aTitleLeavingTheListLeavesItsCategories() {
        val c = ListCats(JSONObject())
        val a = c.add("A", 1)!!; val b = c.add("B", 2)!!
        c.set(a, "/anime/x", true); c.set(b, "/anime/x", true); c.set(b, "/anime/y", true)
        assertTrue(c.forget("/anime/x"))
        assertEquals(emptySet<String>(), c.all()[0].items)
        assertEquals(setOf("/anime/y"), c.all()[1].items)
        assertFalse(c.forget("/anime/x")) // nothing left to save
    }

    @Test fun deletingACategoryOnlyDropsTheCategory() {
        val o = JSONObject()
        val c = ListCats(o)
        val a = c.add("A", 1)!!
        c.set(a, "/anime/x", true)
        c.delete(a)
        assertTrue(c.all().isEmpty())
        c.set(a, "/anime/x", true) // a sheet still open on it: no harm
        assertEquals(0, o.length())
    }
}
