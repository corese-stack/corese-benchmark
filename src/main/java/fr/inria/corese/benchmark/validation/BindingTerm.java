package fr.inria.corese.benchmark.validation;

import java.util.Locale;
import java.util.Objects;

/**
 * Strongly-typed canonical representation of a SPARQL RDF binding value.
 * Complies strictly with W3C SPARQL 1.1 Query Results semantics.
 */
public sealed interface BindingTerm {

    String LEXICAL_NOT_NULL = "Lexical form cannot be null";

    record Iri(String uri) implements BindingTerm {
        public Iri {
            Objects.requireNonNull(uri, "URI cannot be null");
        }
    }

    record Blank(String localId) implements BindingTerm {
        public Blank {
            Objects.requireNonNull(localId, "Blank node local identifier cannot be null");
        }
    }

    record PlainString(String lexical) implements BindingTerm {
        public PlainString {
            Objects.requireNonNull(lexical, LEXICAL_NOT_NULL);
        }
    }

    record LangString(String lexical, String lang) implements BindingTerm {
        public LangString(String lexical, String lang) {
            this.lexical = Objects.requireNonNull(lexical, LEXICAL_NOT_NULL);
            this.lang = Objects.requireNonNull(lang, "Language tag cannot be null").toLowerCase(Locale.ROOT);
        }
    }

    record TypedLiteral(String lexical, String datatypeUri) implements BindingTerm {
        public TypedLiteral {
            Objects.requireNonNull(lexical, LEXICAL_NOT_NULL);
            Objects.requireNonNull(datatypeUri, "Datatype URI cannot be null");
        }
    }

    record Unbound() implements BindingTerm {
        public static final Unbound INSTANCE = new Unbound();
    }

    static BindingTerm fromIri(String uri) {
        return uri == null ? Unbound.INSTANCE : new Iri(uri);
    }

    static BindingTerm fromBlank(String localId) {
        return localId == null ? Unbound.INSTANCE : new Blank(localId);
    }

    static BindingTerm fromLiteral(String lexical, String lang, String datatypeUri) {
        if (lexical == null) {
            return Unbound.INSTANCE;
        }
        if (lang != null && !lang.isBlank()) {
            return new LangString(lexical, lang);
        }
        if (datatypeUri == null || datatypeUri.isEmpty()
                || "http://www.w3.org/2001/XMLSchema#string".equals(datatypeUri)) {
            return new PlainString(lexical);
        }
        return new TypedLiteral(lexical, datatypeUri);
    }
}
