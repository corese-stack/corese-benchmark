package fr.inria.corese.benchmark.metrics;

import fr.inria.corese.benchmark.metrics.SparqlAnalyser.SparqlFeature;
import java.util.EnumSet;
import java.util.List;
import org.apache.jena.query.Query;
import org.apache.jena.query.QueryFactory;
import org.apache.jena.query.QueryParseException;
import org.apache.jena.query.Syntax;
import org.apache.jena.sparql.expr.E_NotExists;
import org.apache.jena.sparql.expr.Expr;
import org.apache.jena.sparql.expr.ExprFunctionOp;
import org.apache.jena.sparql.syntax.Element;
import org.apache.jena.sparql.syntax.ElementAssign;
import org.apache.jena.sparql.syntax.ElementBind;
import org.apache.jena.sparql.syntax.ElementFilter;
import org.apache.jena.sparql.syntax.ElementMinus;
import org.apache.jena.sparql.syntax.ElementNamedGraph;
import org.apache.jena.sparql.syntax.ElementNotExists;
import org.apache.jena.sparql.syntax.ElementOptional;
import org.apache.jena.sparql.syntax.ElementPathBlock;
import org.apache.jena.sparql.syntax.ElementSubQuery;
import org.apache.jena.sparql.syntax.ElementVisitorBase;
import org.apache.jena.sparql.syntax.ElementWalker;

/** Detects capabilities from syntax rather than keywords inside literals or comments. */
final class SparqlFeatureDetector extends ElementVisitorBase {
    private static final List<SparqlFeature> PRIORITY = List.of(
            SparqlFeature.SUBQUERY, SparqlFeature.NAMED_GRAPH, SparqlFeature.NEGATION,
            SparqlFeature.PROPERTY_PATH, SparqlFeature.OPTIONAL_LEFT_JOIN,
            SparqlFeature.AGGREGATION_ANALYTICS, SparqlFeature.SOLUTION_MODIFIERS,
            SparqlFeature.FILTER_FUNCTIONS);
    private final EnumSet<SparqlFeature> features = EnumSet.noneOf(SparqlFeature.class);

    static SparqlFeature classify(String sparql) {
        if (sparql == null || sparql.isBlank()) {
            throw new IllegalArgumentException("SPARQL query must not be empty");
        }
        var detector = new SparqlFeatureDetector();
        try {
            detector.inspect(QueryFactory.create(sparql, Syntax.syntaxSPARQL_11));
        } catch (QueryParseException exception) {
            throw new IllegalArgumentException("Invalid SPARQL 1.1 query", exception);
        }
        return PRIORITY.stream().filter(detector.features::contains)
                .findFirst().orElse(SparqlFeature.BGP_JOIN);
    }

    private void inspect(Query query) {
        if (query.hasAggregators() || query.hasGroupBy() || query.hasHaving()) {
            features.add(SparqlFeature.AGGREGATION_ANALYTICS);
        }
        if (query.isDistinct() || query.isReduced() || query.hasOrderBy()
                || query.hasLimit() || query.hasOffset()) {
            features.add(SparqlFeature.SOLUTION_MODIFIERS);
        }
        if (!query.getNamedGraphURIs().isEmpty()) {
            features.add(SparqlFeature.NAMED_GRAPH);
        }
        query.getProject().getExprs().values().forEach(this::inspectExpression);
        query.getGroupBy().getExprs().values().forEach(this::inspectExpression);
        query.getHavingExprs().forEach(this::inspectExpression);
        if (query.hasOrderBy()) {
            query.getOrderBy().forEach(order -> inspectExpression(order.getExpression()));
        }
        walk(query.getQueryPattern());
    }

    private void walk(Element element) {
        if (element != null) {
            ElementWalker.walk(element, this);
        }
    }

    private void inspectExpression(Expr expression) {
        if (expression instanceof E_NotExists) {
            features.add(SparqlFeature.NEGATION);
        }
        if (expression instanceof ExprFunctionOp graphExpression) {
            walk(graphExpression.getElement());
        }
        if (expression.isFunction()) {
            features.add(SparqlFeature.FILTER_FUNCTIONS);
            expression.getFunction().getArgs().forEach(this::inspectExpression);
        }
    }

    @Override
    public void visit(ElementSubQuery element) {
        features.add(SparqlFeature.SUBQUERY);
        inspect(element.getQuery());
    }

    @Override
    public void visit(ElementNamedGraph element) {
        features.add(SparqlFeature.NAMED_GRAPH);
    }

    @Override
    public void visit(ElementMinus element) {
        features.add(SparqlFeature.NEGATION);
    }

    @Override
    public void visit(ElementNotExists element) {
        features.add(SparqlFeature.NEGATION);
    }

    @Override
    public void visit(ElementOptional element) {
        features.add(SparqlFeature.OPTIONAL_LEFT_JOIN);
    }

    @Override
    public void visit(ElementPathBlock element) {
        element.patternElts().forEachRemaining(path -> {
            if (!path.isTriple()) {
                features.add(SparqlFeature.PROPERTY_PATH);
            }
        });
    }

    @Override
    public void visit(ElementFilter element) {
        features.add(SparqlFeature.FILTER_FUNCTIONS);
        inspectExpression(element.getExpr());
    }

    @Override
    public void visit(ElementBind element) {
        inspectExpression(element.getExpr());
    }

    @Override
    public void visit(ElementAssign element) {
        inspectExpression(element.getExpr());
    }
}
