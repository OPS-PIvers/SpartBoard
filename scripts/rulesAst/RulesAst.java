// Measures and compares firestore.rules with the rules compiler inside the Firestore emulator jar.
// Run: java -cp <cloud-firestore-emulator.jar> RulesAst.java size <rules> | cost <rules> [top] | equiv <before> <after> | renamed <before> <after> <name map>
import com.google.firebase.rules.lang.FirebaseRulesProtoCompiler;
import com.google.firebase.rules.lang.common.FirebaseRulesLangOptions;
import com.google.firebase.rules.v1.Issue;
import com.google.firebase.rules.v1.Source;
import com.google.protobuf.Descriptors.FieldDescriptor;
import com.google.protobuf.Message;
import java.nio.file.Files;
import java.util.*;

public class RulesAst {
  static final FirebaseRulesProtoCompiler COMPILER = FirebaseRulesProtoCompiler.createStandalone(
      FirebaseRulesLangOptions.builder().allowTernaryOperator(true).build());

  static Message compile(String path) throws Exception {
    String text = Files.readString(java.nio.file.Path.of(path));
    var result = COMPILER.compile(Source.newBuilder().addFiles(
        com.google.firebase.rules.v1.File.newBuilder().setName("firestore.rules").setContent(text)));
    List<String> errors = new ArrayList<>();
    for (Issue i : result.getIssues())
      if (i.getSeverity() == Issue.Severity.ERROR)
        errors.add(path + ":" + i.getSourcePosition().getLine() + " " + i.getDescription());
    if (!errors.isEmpty()) { errors.forEach(System.err::println); System.exit(2); }
    return result.getRulesetAst();
  }

  static FieldDescriptor field(Message m, String name) { return m.getDescriptorForType().findFieldByName(name); }
  static Message get(Message m, String name) { var f = field(m, name); return f != null && m.hasField(f) ? (Message) m.getField(f) : null; }
  static String name(Message identifier) { return identifier == null ? null : (String) identifier.getField(field(identifier, "name")); }

  // Source positions are the only part of the AST that is not rule logic.
  static Message stripPositions(Message m) {
    Message.Builder b = m.toBuilder();
    for (FieldDescriptor f : m.getAllFields().keySet()) {
      if (f.getType() != FieldDescriptor.Type.MESSAGE) continue;
      if (f.getMessageType().getName().equals("SourcePosition")) { b.clearField(f); continue; }
      if (f.isRepeated()) for (int i = 0; i < m.getRepeatedFieldCount(f); i++) b.setRepeatedField(f, i, stripPositions((Message) m.getRepeatedField(f, i)));
      else b.setField(f, stripPositions((Message) m.getField(f)));
    }
    return b.build();
  }

  static Map<String, Message> helpers = new HashMap<>();
  static Map<String, List<String>> helperParams = new HashMap<>();

  // Inlines helper calls, substitutes params, and treats x['k'] as x.k.
  static Message rewrite(Message m, Map<String, Message> subst) {
    Message.Builder b = m.toBuilder();
    for (FieldDescriptor f : m.getAllFields().keySet()) {
      if (f.getType() != FieldDescriptor.Type.MESSAGE) continue;
      if (f.isRepeated()) for (int i = 0; i < m.getRepeatedFieldCount(f); i++) b.setRepeatedField(f, i, rewrite((Message) m.getRepeatedField(f, i), subst));
      else b.setField(f, rewrite((Message) m.getField(f), subst));
    }
    Message r = b.build();
    if (!r.getDescriptorForType().getName().equals("Expression")) return r;
    Message member = get(r, "member");
    if (member != null && get(member, "operand") == null && subst.containsKey(name(get(member, "id")))) return subst.get(name(get(member, "id")));
    Message call = get(r, "call");
    if (call == null) return r;
    String fn = name(get(call, "function_name"));
    @SuppressWarnings("unchecked") List<Message> args = (List<Message>) call.getField(field(call, "arguments"));
    if (get(call, "operand") == null && helpers.containsKey(fn) && args.size() == helperParams.get(fn).size()) {
      Map<String, Message> s = new HashMap<>();
      for (int i = 0; i < args.size(); i++) s.put(helperParams.get(fn).get(i), args.get(i));
      return rewrite(helpers.get(fn), s);
    }
    if (get(call, "operand") != null && "[]".equals(fn) && args.size() == 1) {
      Message lit = get(args.get(0), "literal");
      if (lit != null && lit.hasField(field(lit, "string_value"))) {
        Message.Builder mb = r.toBuilder();
        Message.Builder mem = mb.newBuilderForField(field(r, "member"));
        mem.setField(field(member == null ? (Message) mem.getDefaultInstanceForType() : member, "operand"), get(call, "operand"));
        Message.Builder id = mem.newBuilderForField(field(mem.getDefaultInstanceForType(), "id"));
        id.setField(field(id.getDefaultInstanceForType(), "name"), lit.getField(field(lit, "string_value")));
        mem.setField(field(mem.getDefaultInstanceForType(), "id"), id.build());
        return mb.clear().setField(field(r, "member"), mem.build()).build();
      }
    }
    return r;
  }

  // Original names still bound or referenced in the minified text; mapping back would hide them.
  static Set<String> leftovers = new TreeSet<>();

  // Maps short names back to originals, but only where a name is bound or referenced, never a field, method or permission.
  static Message unrename(Message m, Map<String, String> back, boolean renamable) {
    String type = m.getDescriptorForType().getName();
    if (type.equals("Identifier")) {
      String n = name(m);
      if (renamable && !back.containsKey(n) && back.containsValue(n)) leftovers.add(n);
      return renamable && back.containsKey(n) ? m.toBuilder().setField(field(m, "name"), back.get(n)).build() : m;
    }
    boolean hasOperand = (type.equals("Member") || type.equals("CallExpression")) && get(m, "operand") != null;
    Message.Builder b = m.toBuilder();
    for (FieldDescriptor f : m.getAllFields().keySet()) {
      if (f.getType() != FieldDescriptor.Type.MESSAGE) continue;
      boolean r = switch (type + "." + f.getName()) {
        case "Function.id", "Function.params_ids", "Binding.id", "PathSegment.capture", "PathSegment.glob_capture" -> true;
        case "Member.id", "CallExpression.function_name" -> !hasOperand && get(m, "package_name") == null;
        default -> false;
      };
      if (f.isRepeated()) for (int i = 0; i < m.getRepeatedFieldCount(f); i++) b.setRepeatedField(f, i, unrename((Message) m.getRepeatedField(f, i), back, r));
      else b.setField(f, unrename((Message) m.getField(f), back, r));
    }
    return b.build();
  }

  static Message documentsRule(Message ast) {
    Message service = (Message) ast.getRepeatedField(field(ast, "service_rules"), 0);
    return (Message) service.getRepeatedField(field(service, "match_rules"), 0);
  }

  static int line(Message m) {
    Message sp = get(m, "source_position");
    if (sp != null) return ((Number) sp.getField(field(sp, "line"))).intValue();
    for (FieldDescriptor f : m.getAllFields().keySet())
      if (f.getType() == FieldDescriptor.Type.MESSAGE && !f.isRepeated()) { int l = line((Message) m.getField(f)); if (l > 0) return l; }
    return -1;
  }

  // Reports the first differing permission or function per match block, by line in <after>.
  static int report(Message before, Message after) {
    int diffs = 0;
    for (String kind : List.of("functions", "permissions", "match_rules")) {
      var fb = field(before, kind);
      int nb = before.getRepeatedFieldCount(fb), na = after.getRepeatedFieldCount(fb);
      if (nb != na) { System.err.println("count of " + kind + " differs near line " + line(after)); diffs++; continue; }
      for (int i = 0; i < nb; i++) {
        Message x = (Message) before.getRepeatedField(fb, i), y = (Message) after.getRepeatedField(fb, i);
        if (kind.equals("match_rules")) diffs += report(x, y);
        else if (!stripPositions(x).equals(stripPositions(y))) { System.err.println(kind + " differs at line " + line(y)); diffs++; }
      }
    }
    return diffs;
  }


  // ---- cost: compile work as Google's rules compiler sees it (every helper call re-expands the helper's body) ----
  static final class CostScope {
    final CostScope parent; final Map<String, Message> fns = new HashMap<>();
    CostScope(CostScope parent) { this.parent = parent; }
    Message fn(String n) { for (CostScope s = this; s != null; s = s.parent) if (s.fns.containsKey(n)) return s.fns.get(n); return null; }
  }
  static final Map<Message, CostScope> fnScopes = new IdentityHashMap<>();
  static final Map<Message, long[]> fnCost = new IdentityHashMap<>();

  @SuppressWarnings("unchecked")
  static List<Message> items(Message m, String name) { return (List<Message>) m.getField(field(m, name)); }

  // {expanded nodes, expanded helper calls} of an expression, with every helper call inlined.
  @SuppressWarnings("unchecked")
  static long[] expanded(Message e, CostScope sc) {
    long nodes = 1, calls = 0;
    Message call = get(e, "call");
    if (call != null && get(call, "operand") == null && get(call, "package_name") == null) {
      Message f = sc.fn(name(get(call, "function_name")));
      if (f != null) {
        long[] body = fnCost.get(f);
        if (body == null) { body = expanded(get(f, "body"), fnScopes.get(f)); fnCost.put(f, body); }
        nodes += body[0]; calls += body[1] + 1;
      }
    }
    for (FieldDescriptor fd : e.getAllFields().keySet()) {
      if (fd.getType() != FieldDescriptor.Type.MESSAGE || fd.getMessageType().getName().equals("SourcePosition")) continue;
      List<Message> kids = fd.isRepeated() ? (List<Message>) (List<?>) e.getField(fd) : List.of((Message) e.getField(fd));
      for (Message k : kids) {
        long[] c = k.getDescriptorForType().getName().equals("Expression") ? expanded(k, sc) : expandedChildren(k, sc);
        nodes += c[0]; calls += c[1];
      }
    }
    return new long[] { nodes, calls };
  }
  @SuppressWarnings("unchecked")
  static long[] expandedChildren(Message m, CostScope sc) {
    long nodes = 0, calls = 0;
    for (FieldDescriptor fd : m.getAllFields().keySet()) {
      if (fd.getType() != FieldDescriptor.Type.MESSAGE || fd.getMessageType().getName().equals("SourcePosition")) continue;
      List<Message> kids = fd.isRepeated() ? (List<Message>) (List<?>) m.getField(fd) : List.of((Message) m.getField(fd));
      for (Message k : kids) {
        long[] c = k.getDescriptorForType().getName().equals("Expression") ? expanded(k, sc) : expandedChildren(k, sc);
        nodes += c[0]; calls += c[1];
      }
    }
    return new long[] { nodes, calls };
  }
  static void costMatch(Message match, CostScope parent, String path, Map<String, long[]> out) {
    CostScope sc = new CostScope(parent);
    for (Message f : items(match, "functions")) { sc.fns.put(name(get(f, "id")), f); fnScopes.put(f, sc); }
    StringBuilder p = new StringBuilder(path);
    for (Message seg : items(get(match, "path"), "segments")) {
      Message ex = get(seg, "expression"), lit = ex == null ? null : get(ex, "literal");
      p.append('/').append(lit != null && lit.hasField(field(lit, "string_value")) ? (String) lit.getField(field(lit, "string_value")) : "{}");
    }
    for (Message perm : items(match, "permissions")) {
      long[] c = expanded(get(perm, "allow"), sc), t = out.computeIfAbsent(p.toString(), k -> new long[2]);
      t[0] += c[0]; t[1] += c[1];
    }
    for (Message m : items(match, "match_rules")) costMatch(m, sc, p.toString(), out);
  }

  public static void main(String[] a) throws Exception {
    if (a[0].equals("cost")) {
      Message ast = compile(a[1]);
      CostScope top = new CostScope(null);
      for (Message f : items(ast, "functions")) { top.fns.put(name(get(f, "id")), f); fnScopes.put(f, top); }
      Map<String, long[]> byPath = new TreeMap<>();
      for (Message svc : items(ast, "service_rules")) {
        CostScope ss = new CostScope(top);
        for (Message f : items(svc, "functions")) { ss.fns.put(name(get(f, "id")), f); fnScopes.put(f, ss); }
        for (Message m : items(svc, "match_rules")) costMatch(m, ss, "", byPath);
      }
      long nodes = 0, calls = 0;
      for (long[] v : byPath.values()) { nodes += v[0]; calls += v[1]; }
      int top_n = a.length > 2 ? Integer.parseInt(a[2]) : 0;
      if (top_n > 0) {
        Map<String, long[]> byCollection = new TreeMap<>();
        for (var e : byPath.entrySet()) {
          String[] segs = e.getKey().split("/");
          long[] t = byCollection.computeIfAbsent(segs.length > 4 ? segs[4] : e.getKey(), k -> new long[2]);
          t[0] += e.getValue()[0]; t[1] += e.getValue()[1];
        }
        byCollection.entrySet().stream()
          .sorted((x, y) -> Long.compare(y.getValue()[0] + 3 * y.getValue()[1], x.getValue()[0] + 3 * x.getValue()[1]))
          .limit(top_n)
          .forEach(e -> System.out.println("  " + (e.getValue()[0] + 3 * e.getValue()[1]) + " " + e.getKey()));
      }
      System.out.println(nodes + " " + calls);
      return;
    }
    if (a[0].equals("size")) {
      System.out.println(stripPositions(compile(a[1])).getSerializedSize());
      return;
    }
    Message before = compile(a[1]), after = compile(a[2]);
    if (a[0].equals("renamed")) {
      Map<String, String> back = new HashMap<>();
      for (String l : Files.readAllLines(java.nio.file.Path.of(a[3]))) {
        if (l.isBlank()) continue;
        String[] p = l.trim().split(" ");
        if (p.length != 2 || back.put(p[0], p[1]) != null) { System.err.println("bad name map line: " + l); System.exit(2); }
      }
      if (new HashSet<>(back.values()).size() != back.size()) { System.err.println("name map is not one-to-one"); System.exit(2); }
      Message mapped = unrename(after, back, false);
      if (!leftovers.isEmpty()) { System.out.println("DIFFERENT"); System.err.println("names the minifier missed: " + leftovers); System.exit(1); }
      boolean same = stripPositions(before).equals(stripPositions(mapped));
      System.out.println(same ? "EQUIVALENT (" + back.size() + " names renamed)" : "DIFFERENT");
      if (!same) { report(documentsRule(before), documentsRule(mapped)); System.exit(1); }
      return;
    }
    Set<String> existing = new HashSet<>();
    Message docsBefore = documentsRule(before);
    for (Object f : (List<?>) docsBefore.getField(field(docsBefore, "functions"))) existing.add(name(get((Message) f, "id")));
    Message docs = documentsRule(after);
    FieldDescriptor fnsField = field(docs, "functions");
    List<Message> kept = new ArrayList<>();
    for (Object o : (List<?>) docs.getField(fnsField)) {
      Message f = (Message) o;
      String n = name(get(f, "id"));
      if (existing.contains(n)) { kept.add(f); continue; }
      helpers.put(n, get(f, "body"));
      List<String> ps = new ArrayList<>();
      for (Object p : (List<?>) f.getField(field(f, "params_ids"))) ps.add(name((Message) p));
      helperParams.put(n, ps);
    }
    Message afterNoHelpers = after.toBuilder().build();
    Message.Builder docsB = docs.toBuilder().clearField(fnsField);
    for (Message f : kept) docsB.addRepeatedField(fnsField, f);
    Message service = (Message) after.getRepeatedField(field(after, "service_rules"), 0);
    Message.Builder serviceB = service.toBuilder();
    serviceB.setRepeatedField(field(service, "match_rules"), 0, docsB.build());
    afterNoHelpers = after.toBuilder().setRepeatedField(field(after, "service_rules"), 0, serviceB.build()).build();
    Message x = rewrite(before, Map.of()), y = rewrite(afterNoHelpers, Map.of());
    System.out.println("helpers inlined: " + new TreeSet<>(helpers.keySet()));
    if (stripPositions(x).equals(stripPositions(y))) { System.out.println("EQUIVALENT"); return; }
    int d = report(documentsRule(x), documentsRule(y));
    System.out.println("DIFFERENT (" + d + " sites)");
    System.exit(1);
  }
}
