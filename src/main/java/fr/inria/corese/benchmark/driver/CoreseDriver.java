package fr.inria.corese.benchmark.driver;

import fr.inria.corese.core.Graph;
import fr.inria.corese.core.load.Load;
import fr.inria.corese.core.api.Loader;
import fr.inria.corese.core.query.QueryProcess;
import fr.inria.corese.core.rule.RuleEngine;

public class CoreseDriver implements TripleStoreDriver {

    private final String name;
    private final boolean inference;
    private Graph graph;

    public CoreseDriver(String name, boolean inference) {
        this.name = name;
        this.inference = inference;
    }

    @Override
    public void init() {
        this.graph = Graph.create();
    }

    private void applyInference() throws Exception {
        if (inference) {
            RuleEngine re = RuleEngine.create(graph);
            re.setProfile(RuleEngine.ProfileType.OWL_RL);
            re.process();
        }
    }

    @Override
    public void load(String filePath) throws Exception {
        Load loader = Load.create(graph);
        loader.parse(filePath, Loader.format.NT_FORMAT);
        applyInference();
    }

    @Override
    public long query(String sparql) throws Exception {
        QueryProcess exec = QueryProcess.create(graph);
        long start = System.currentTimeMillis();
        exec.query(sparql);
        return System.currentTimeMillis() - start;
    }

    @Override
    public long getGraphSize() {
        return graph.size();
    }

    @Override
    public void clear() {
        this.graph = Graph.create();
    }

    @Override
    public void close() {
        this.graph = null;
    }

    @Override
    public String getName() {
        return name;
    }
}
